/*
  Copyright 2025 Adobe. All rights reserved.
  This file is licensed to you under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may obtain a copy
  of the License at http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software distributed under
  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
  OF ANY KIND, either express or implied. See the License for the specific language
  governing permissions and limitations under the License.
*/

/**
 * Transformer to convert Commerce product format to Google Merchant Center format.
 *
 * @typedef {import('../types/commerce').CommerceProduct} CommerceProduct
 * @typedef {import('../types/commerce').CommerceSource} CommerceSource
 * @typedef {import('../types/commerce').CommerceAttribute} CommerceAttribute
 * @typedef {import('../types/commerce').CommerceImage} CommerceImage
 * @typedef {import('@google-shopping/products').protos.google.shopping.merchant.products.v1.IProductInput} IProductInput
 * @typedef {import('@google-shopping/products').protos.google.shopping.merchant.products.v1.IProductAttributes} IProductAttributes
 * @typedef {import('@google-shopping/products').protos.google.shopping.type.ICustomAttribute} ICustomAttribute
 */

const { protos } = require("@google-shopping/products");

const Availability = protos.google.shopping.merchant.products.v1.Availability;
const Condition = protos.google.shopping.merchant.products.v1.Condition;

const GOOGLE_STANDARD_FIELDS = [
  "gtin",
  "mpn",
  "brand",
  "condition",
  "color",
  "size",
  "gender",
  "ageGroup",
  "material",
  "pattern",
  "googleProductCategory",
  "itemGroupId",
];

const PRODUCT_FIELD_MASKS = [
  "product_attributes.title",
  "product_attributes.description",
  "product_attributes.link",
  "product_attributes.image_link",
  "product_attributes.additional_image_links",
  "product_attributes.availability",
  "product_attributes.condition",
  "product_attributes.shipping",
  "product_attributes.price",
  "product_attributes.gtins",
  "product_attributes.size",
  "product_attributes.mpn",
  "product_attributes.brand",
  "product_attributes.color",
  "product_attributes.gender",
  "product_attributes.age_group",
  "product_attributes.material",
  "product_attributes.pattern",
  "product_attributes.google_product_category",
  "product_attributes.item_group_id",
  "product_attributes.identifier_exists",
];

/*****************************************/
/* Customize these functions             */
/*****************************************/

/**
 * Constructs the product URL using a template string.
 * Supports placeholders: {sku}, {urlKey}
 * Examples:
 * - https://example.com/products/{sku}
 * - https://example.com/products/{urlKey}/{sku}
 *
 * @param {CommerceProduct} product - The Commerce product object
 * @param {string} urlTemplate - Template with {sku} and {urlKey} placeholders
 * @returns {string} The full product URL
 */
const getProductUrl = (product, urlTemplate) => {
  return urlTemplate
    .replace("{sku}", product.sku)
    .replace("{urlKey}", product.urlKey);
};

/**
 * Gets the availability of the product.
 *
 * @param {boolean} inStock - The inStock value
 * @returns {number} Google Availability enum value
 */
const getAvailability = (inStock) => {
  return inStock ? Availability.IN_STOCK : Availability.OUT_OF_STOCK;
};

/*
 * Gets the shipping info for the product.
 *
 * @param {CommerceProduct} product - The Commerce product object
 * @param {string} country - The country code
 * @returns {object} The shipping info
 */
const getShippingInfo = (product, country) => {
  const shippingMethod = getAttributeValue(
    product.attributes,
    "shippingMethod"
  );
  const shippingPrice = getAttributeValue(product.attributes, "shippingPrice");
  const currencyCode =
    getAttributeValue(product.attributes, "shippingCurrency") ||
    transformPrice(product).currencyCode;
  return {
    price: {
      amountMicros: toMicros(shippingPrice || 0),
      currencyCode,
    },
    country,
    service: shippingMethod || "standard",
  };
};

/*****************************************/
/* Product transformation functions      */
/*****************************************/

/**
 * Converts a price amount to micros (1 USD = 1,000,000 micros).
 *
 * @param {number} amount - The price amount (e.g., 29.99)
 * @returns {number} The amount in micros
 */
const toMicros = (amount) => Math.round(amount * 1_000_000);

/**
 * Extracts an attribute value from the Commerce product attributes array.
 * @param {CommerceAttribute[]} attributes - The attributes array
 * @param {string} name - The attribute name to find
 * @returns {string|null} The value of the attribute, or null if not found
 */
const getAttributeValue = (attributes, name) => {
  const attr = attributes?.find((a) => a.name === name);
  return attr?.value || null;
};

/**
 * Gets the primary image URL from the Commerce product.
 *
 * @param {CommerceImage[]} images - The images array from Commerce product
 * @returns {string|null} The primary image URL or null
 */
const getPrimaryImageUrl = (images) => {
  if (!images || images.length === 0) return null;
  const mainImage = images.find((img) => img.roles?.includes("image"));
  return mainImage?.url || images[0]?.url || null;
};

/**
 * Gets additional image URLs (excluding the primary image).
 *
 * @param {CommerceImage[]} images - The images array from Commerce product
 * @returns {string[]} Array of additional image URLs
 */
const getAdditionalImageUrls = (images) => {
  if (!images || images.length <= 1) return [];
  const primaryUrl = getPrimaryImageUrl(images);
  const uniqueUrls = [...new Set(images.map((img) => img.url))];
  return uniqueUrls.filter((url) => url !== primaryUrl);
};

/**
 * Maps condition string to Google Condition enum.
 *
 * @param {string|null} condition - The condition string
 * @returns {number} Google Condition enum value
 */
const mapCondition = (condition) => {
  const conditionMap = {
    new: Condition.NEW,
    used: Condition.USED,
    refurbished: Condition.REFURBISHED,
  };
  return conditionMap[condition?.toLowerCase()] || Condition.NEW;
};

/**
 * Transforms price from Commerce product to Google format (micros).
 *
 * @param {CommerceProduct} product - The Commerce product object
 * @returns {{amountMicros: number, currencyCode: string}|null} Google price format or null
 */
const transformPrice = (product) => {
  let amount, currency;

  if (product.price?.final?.amount) {
    amount = product.price.final.amount.value;
    currency = product.price.final.amount.currency;
  } else if (product.priceRange?.minimum?.final?.amount) {
    amount = product.priceRange.minimum.final.amount.value;
    currency = product.priceRange.minimum.final.amount.currency;
  }

  if (amount == null || !currency) return null;

  return {
    amountMicros: toMicros(amount),
    currencyCode: currency,
  };
};

/**
 * Transforms a Commerce product to Google Merchant Center IProductInput format.
 *
 * @param {string} feedLabel - The feed label for the Google product feed
 * @param {CommerceProduct} product - The Commerce product object
 * @param {CommerceSource} source - The source object containing locale info
 * @param {string} urlTemplate - Template for product links
 * @returns {IProductInput} Google SDK ProductInput object
 * @throws {Error} If product has no price (required by Google)
 */
const transformProduct = (feedLabel, product, source, urlTemplate) => {
  const [language, country] = source.locale.split("-");
  const { attributes = [], images = [] } = product;

  const price = transformPrice(product);
  if (!price) {
    throw new Error(`Product ${product.sku} has no price`);
  }

  /** @type {IProductAttributes} */
  const productAttributes = {
    title: product.name,
    description: product.description || product.shortDescription,
    link: getProductUrl(product, urlTemplate),
    imageLink: getPrimaryImageUrl(images),
    availability: getAvailability(product.inStock),
    condition: mapCondition(getAttributeValue(attributes, "condition")),
    shipping: [getShippingInfo(product, country)],
    price,
  };

  /** @type {ICustomAttribute[]} */
  const customAttributes = [];

  for (const attr of attributes) {
    const value = attr.value;
    if (!value) continue;

    if (GOOGLE_STANDARD_FIELDS.includes(attr.name)) {
      if (attr.name === "gtin") {
        productAttributes.gtins = [value];
      } else {
        productAttributes[attr.name] = value;
      }
    } else {
      customAttributes.push({ name: attr.name, value });
    }
  }

  // Google requires: gtin, mpn+brand, or identifierExists=false
  const hasIdentifiers = productAttributes.gtins || productAttributes.mpn;
  if (!hasIdentifiers) {
    const manufacturerSku = getAttributeValue(attributes, "manufacturerSku");
    if (productAttributes.brand && manufacturerSku) {
      productAttributes.mpn = manufacturerSku;
    } else {
      productAttributes.identifierExists = false;
    }
  }

  const additionalImages = getAdditionalImageUrls(images);
  if (additionalImages.length > 0) {
    productAttributes.additionalImageLinks = additionalImages;
  }

  /** @type {IProductInput} */
  const productInput = {
    contentLanguage: language,
    feedLabel,
    offerId: product.sku,
    productAttributes,
  };

  if (customAttributes.length > 0) {
    productInput.customAttributes = customAttributes;
  }

  return productInput;
};

module.exports = {
  transformProduct,
  PRODUCT_FIELD_MASKS,
};

/*
  Copyright 2026 Adobe. All rights reserved.
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
const { loadAttributeMappingConfig } = require("../actions/config");

const Availability = protos.google.shopping.merchant.products.v1.Availability;
const Condition = protos.google.shopping.merchant.products.v1.Condition;

// Load attribute mapping config once at module initialization
const attributeMapping = loadAttributeMappingConfig();

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
 * Gets the availability of the product.
 *
 * @param {boolean} inStock - The inStock value
 * @returns {number} Google Availability enum value
 */
const getAvailability = (inStock) => {
  return inStock ? Availability.IN_STOCK : Availability.OUT_OF_STOCK;
};

/**
 * Gets the shipping info for the product.
 * This is a customization point - modify this function to implement your shipping logic.
 *
 * @param {CommerceProduct} product - The Commerce product object
 * @param {string} country - The target country code
 * @returns {object|null} The shipping info, or null to omit shipping (use Merchant Center settings)
 */
const getShippingInfo = (product, country) => {
  // Default implementation: looks for shippingMethod and shippingPrice attributes.
  // For complex shipping logic (multiple methods, calculated prices, etc.),
  // customize this function or return null to use Merchant Center account settings.
  const shippingMethod = getAttributeValue(
    product.attributes,
    "shippingMethod"
  );
  const shippingPrice = getAttributeValue(product.attributes, "shippingPrice");

  // If no shipping attributes, return null to omit shipping from the feed
  if (!shippingPrice) {
    return null;
  }

  return {
    price: {
      amountMicros: toMicros(shippingPrice),
      currencyCode: transformPrice(product)?.currencyCode || "USD",
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
 * Finds the Google field name for a custom attribute name using field mappings.
 * Config format: { googleField: customAttr }
 *
 * @param {string} customAttrName - The custom attribute name
 * @returns {string} The Google field name, or the original name if no mapping exists
 */
const getGoogleFieldName = (customAttrName) => {
  const { fieldMappings } = attributeMapping;
  const entry = Object.entries(fieldMappings).find(
    ([, customAttr]) => customAttr === customAttrName
  );
  return entry ? entry[0] : customAttrName;
};

/**
 * Finds the custom attribute name for a field using field mappings.
 * Config format: { field: customAttr }
 *
 * @param {string} field - The field name
 * @returns {string} The custom attribute name, or the field name if no mapping exists
 */
const getCustomAttrName = (field) => {
  const { fieldMappings } = attributeMapping;
  return fieldMappings[field] || field;
};

/**
 * Maps a custom attribute value to a Google value using value mappings.
 * Config format: { googleValue: customValue }
 * Falls back to the original value (lowercased) if no mapping exists.
 *
 * @param {string|null} customValue - The custom attribute value
 * @param {string} field - The Google field name (e.g., "condition", "gender")
 * @returns {string|null} The mapped Google value or original value
 */
const mapEnumValue = (customValue, field) => {
  if (!customValue) return null;
  const { valueMappings } = attributeMapping;
  const fieldValueMap = valueMappings?.[field] || {};
  // Find which Google value maps to this custom value
  const entry = Object.entries(fieldValueMap).find(
    ([, mappedCustomValue]) => mappedCustomValue === customValue
  );
  return entry ? entry[0] : customValue.toLowerCase();
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
 * Categorizes Commerce attributes into Google standard fields and custom attributes.
 * Uses field mappings to translate custom attribute names to Google field names.
 *
 * @param {CommerceAttribute[]} attributes - The attributes to process
 * @returns {{ standard: object, custom: ICustomAttribute[] }} Categorized fields
 */
const categorizeAttributes = (attributes) => {
  const standard = {};
  const custom = [];

  for (const attr of attributes) {
    const value = attr.value;
    if (!value) continue;

    // Check if this custom attribute maps to a Google field
    const googleField = getGoogleFieldName(attr.name);

    if (GOOGLE_STANDARD_FIELDS.includes(googleField)) {
      if (googleField === "gtin") {
        standard.gtins = [value];
      } else if (["condition", "gender", "ageGroup"].includes(googleField)) {
        // Apply value mapping for enum fields
        standard[googleField] = mapEnumValue(value, googleField);
      } else {
        standard[googleField] = value;
      }
    } else {
      custom.push({ name: attr.name, value: String(value) });
    }
  }

  return { standard, custom };
};

/**
 * Checks if product has valid identifiers per Google requirements.
 * Google requires: gtin, or mpn+brand. If neither exists, identifierExists must be false.
 *
 * @param {object} standardFields - Object containing gtins, mpn, brand fields
 * @returns {boolean} True if product has valid identifiers
 */
const hasValidIdentifiers = (standardFields) => {
  return !!(
    standardFields.gtins ||
    (standardFields.brand && standardFields.mpn)
  );
};

/**
 * Builds the final IProductInput object.
 *
 * @param {string} feedLabel - The feed label
 * @param {string} language - The content language
 * @param {string} offerId - The offer/product ID (SKU)
 * @param {IProductAttributes} productAttributes - The product attributes
 * @param {ICustomAttribute[]} customAttributes - Custom attributes array
 * @returns {IProductInput} The complete product input object
 */
const buildProductInput = (
  feedLabel,
  language,
  offerId,
  productAttributes,
  customAttributes
) => {
  /** @type {IProductInput} */
  const productInput = {
    contentLanguage: language,
    feedLabel,
    offerId,
    productAttributes,
  };

  if (customAttributes.length > 0) {
    productInput.customAttributes = customAttributes;
  }

  return productInput;
};

/**
 * Transforms a Commerce product to Google Merchant Center IProductInput format.
 *
 * @param {string} feedLabel - The feed label for the Google product feed
 * @param {CommerceProduct} product - The Commerce product object
 * @param {string} language - ISO 639-1 content language code (e.g., "en")
 * @param {string} country - ISO 3166-1 alpha-2 target country code (e.g., "US")
 * @param {string} urlTemplate - Template for product links
 * @returns {IProductInput} Google SDK ProductInput object
 * @throws {Error} If product has no price (required by Google)
 */
const transformProduct = (
  feedLabel,
  product,
  language,
  country,
  urlTemplate
) => {
  const { attributes = [], images = [] } = product;

  const price = transformPrice(product);
  if (!price) {
    throw new Error(`Product ${product.sku} does not have a price`);
  }

  const { standard, custom } = categorizeAttributes(attributes);
  const additionalImages = getAdditionalImageUrls(images);
  const conditionAttrName = getCustomAttrName("condition");
  const rawCondition = getAttributeValue(attributes, conditionAttrName);
  const mappedCondition = mapEnumValue(rawCondition, "condition");

  const productAttributes = {
    title: product.name,
    description: product.description || product.shortDescription,
    link: getProductUrl(product, urlTemplate),
    imageLink: getPrimaryImageUrl(images),
    availability: getAvailability(product.inStock),
    condition: mapCondition(mappedCondition),
    price,
    ...standard,
  };

  const shippingInfo = getShippingInfo(product, country);
  if (shippingInfo) {
    productAttributes.shipping = [shippingInfo];
  }
  if (!hasValidIdentifiers(standard)) {
    productAttributes.identifierExists = false;
  }
  if (additionalImages.length > 0) {
    productAttributes.additionalImageLinks = additionalImages;
  }

  return buildProductInput(
    feedLabel,
    language,
    product.sku,
    productAttributes,
    custom
  );
};

/**
 * Transforms a variant from a complex product to Google Merchant Center format.
 * Uses parent product data for shared fields (description, images) and
 * variant-specific data for unique fields (sku, price).
 *
 * The parent SKU is used as itemGroupId to link variants together per GMC requirements.
 *
 * @param {string} feedLabel - The feed label for the Google product feed
 * @param {CommerceProduct} parentProduct - The parent complex product
 * @param {object} variant - The variant object from the variants query
 * @param {string[]} variant.selections - Array of selected option IDs
 * @param {CommerceProduct} variant.product - The variant's product data
 * @param {string} language - ISO 639-1 content language code (e.g., "en")
 * @param {string} country - ISO 3166-1 alpha-2 target country code (e.g., "US")
 * @param {string} urlTemplate - Template for product links
 * @returns {IProductInput} Google SDK ProductInput object
 * @throws {Error} If variant has no price
 */
const transformVariant = (
  feedLabel,
  parentProduct,
  variant,
  language,
  country,
  urlTemplate
) => {
  const variantProduct = variant.product;
  const parentAttributes = parentProduct.attributes || [];
  const variantAttributes = variantProduct.attributes || [];

  // Use variant images if available, otherwise fall back to parent
  const images =
    variantProduct.images?.length > 0
      ? variantProduct.images
      : parentProduct.images || [];

  const price = transformPrice(variantProduct);
  if (!price) {
    throw new Error(`Variant ${variantProduct.sku} does not have a price`);
  }

  // Categorize into Google standard fields and custom attributes
  const parentCategorized = categorizeAttributes(parentAttributes);
  const variantCategorized = categorizeAttributes(variantAttributes);

  // Merge Google standard attributes from parent and variant
  const mergedAttributes = {
    ...parentCategorized.standard,
    ...variantCategorized.standard,
  };
  const additionalImages = getAdditionalImageUrls(images);
  const conditionAttrName = getCustomAttrName("condition");
  const rawCondition = getAttributeValue(variantAttributes, conditionAttrName);
  const mappedCondition = mapEnumValue(rawCondition, "condition");

  const productAttributes = {
    title: variantProduct.name || parentProduct.name,
    description:
      variantProduct.description ||
      parentProduct.description ||
      parentProduct.shortDescription,
    link: getProductUrl(parentProduct, urlTemplate), // link to the parent product for PDP
    imageLink: getPrimaryImageUrl(images),
    availability: getAvailability(variantProduct.inStock),
    condition: mapCondition(mappedCondition),
    price,
    itemGroupId: parentProduct.sku,
    ...mergedAttributes,
  };

  const shippingInfo = getShippingInfo(variantProduct, country);
  if (shippingInfo) {
    productAttributes.shipping = [shippingInfo];
  }
  if (!hasValidIdentifiers(mergedAttributes)) {
    productAttributes.identifierExists = false;
  }
  if (additionalImages.length > 0) {
    productAttributes.additionalImageLinks = additionalImages;
  }

  return buildProductInput(
    feedLabel,
    language,
    variantProduct.sku,
    productAttributes,
    variantCategorized.custom
  );
};

module.exports = {
  transformProduct,
  transformVariant,
  PRODUCT_FIELD_MASKS,
};

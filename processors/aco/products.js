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

const { chunk, groupByOperation } = require("../../actions/utils.js");
const {
  getProducts,
  getVariants,
  isComplexProduct,
} = require("../../clients/commerce.js");
const { upsertProducts, deleteProducts } = require("../../clients/google.js");
const {
  transformProduct,
  transformVariant,
} = require("../../transformers/product.js");

/**
 * @typedef {import('@google-shopping/products').protos.google.shopping.merchant.products.v1.IProductInput} IProductInput
 */

const BATCH_SIZE = 25;

/**
 * Gets the variantOf link from an item if it exists.
 *
 * @param {object} item - The event item
 * @returns {object|null} The variantOf link or null
 */
const getVariantOfLink = (item) => {
  return item.links?.find((link) => link.type === "variantOf") || null;
};

/**
 * Categorizes event items into simple product items, complex product variant items, and complex product parent SKUs.
 *
 * @param {object[]} items - Event items with sku, sources, and optional links
 * @returns {{ simpleItems: object[], complexVariantItems: object[], complexParentSkus: string[] }}
 */
const categorizeItems = (items) => {
  const simpleItems = [];
  const complexVariantItems = [];
  const complexParentSkus = new Set();

  // Separate variants from other items, collect parent SKUs
  for (const item of items) {
    const variantOfLink = getVariantOfLink(item);
    if (variantOfLink) {
      complexParentSkus.add(variantOfLink.sku);
      complexVariantItems.push(item);
    } else {
      simpleItems.push(item);
    }
  }

  // Simple items are those without variantOf link AND not a parent
  const simpleItemsFiltered = simpleItems.filter(
    (item) => !complexParentSkus.has(item.sku)
  );

  return {
    simpleItems: simpleItemsFiltered,
    complexVariantItems,
    complexParentSkus: [...complexParentSkus],
  };
};

/**
 * Fetches parent products and their variants from Commerce API.
 *
 * @param {string} baseUrl - The base URL of the Commerce API
 * @param {string} priceBookId - The price book ID
 * @param {string} viewId - The view ID
 * @param {string} tenantId - The tenant ID
 * @param {string[]} parentSkus - Array of parent SKUs to fetch
 * @param {Logger} logger - The logger to use
 * @returns {Promise<Map<string, {parentProduct: object, variant: object}>>}
 */
const fetchVariantData = async (
  baseUrl,
  priceBookId,
  viewId,
  tenantId,
  parentSkus,
  logger
) => {
  const variantDataMap = new Map();

  if (parentSkus.length === 0) return variantDataMap;

  logger.info(
    `Fetching ${parentSkus.length} parent products and their variants`
  );

  const parentBatches = chunk(parentSkus, BATCH_SIZE);
  const parentMap = new Map();

  for (const batch of parentBatches) {
    const products = await getProducts(
      baseUrl,
      viewId,
      priceBookId,
      tenantId,
      batch
    );
    for (const product of products) {
      parentMap.set(product.sku, product);
    }
  }

  // For each parent, fetch its variants
  for (const parentSku of parentSkus) {
    const parentProduct = parentMap.get(parentSku);
    if (!parentProduct) {
      logger.error(`Parent product ${parentSku} not found in Commerce`);
      continue;
    }

    try {
      const variants = await getVariants(
        baseUrl,
        viewId,
        priceBookId,
        tenantId,
        parentSku
      );
      logger.info(`Found ${variants.length} variants for parent ${parentSku}`);

      // Map each variant SKU to its data
      for (const variant of variants) {
        variantDataMap.set(variant.product.sku, { parentProduct, variant });
      }
    } catch (error) {
      logger.error(
        `Failed to fetch variants for ${parentSku}: ${error.message}`
      );
    }
  }

  return variantDataMap;
};

/**
 * Fetches simple products from Commerce API.
 *
 * @param {string} baseUrl - The base URL of the Commerce API
 * @param {string} priceBookId - The price book ID
 * @param {string} viewId - The view ID
 * @param {string} tenantId - The tenant ID
 * @param {string[]} skus - Array of simple product SKUs to fetch
 * @param {Logger} logger - The logger to use
 * @returns {Promise<Map<string, object>>} Map of SKU to product
 */
const fetchSimpleProducts = async (
  baseUrl,
  priceBookId,
  viewId,
  tenantId,
  skus,
  logger
) => {
  const productMap = new Map();

  if (skus.length === 0) return productMap;

  logger.info(`Fetching ${skus.length} simple products`);

  const batches = chunk(skus, BATCH_SIZE);
  for (const batch of batches) {
    const products = await getProducts(
      baseUrl,
      viewId,
      priceBookId,
      tenantId,
      batch
    );
    for (const product of products) {
      productMap.set(product.sku, product);
    }
  }

  return productMap;
};

/**
 * Transforms complex variant product structures for Google Merchant Center
 *
 * @param {string} googleFeedLabel - The Google feed label
 * @param {string} language - ISO 639-1 content language code
 * @param {string} country - ISO 3166-1 alpha-2 target country code
 * @param {string} storeUrlTemplate - The store URL template
 * @param {object[]} variantItems - Items with sku
 * @param {Map<string, {parentProduct: object, variant: object}>} variantDataMap - Variant data
 * @param {Logger} logger - The logger to use
 * @returns {IProductInput[]} Array of transformed Google product inputs
 * @throws {Error} If a variant is not found or fails to transform
 */
const transformVariantItems = (
  googleFeedLabel,
  language,
  country,
  storeUrlTemplate,
  variantItems,
  variantDataMap,
  logger
) => {
  const transformed = [];

  for (const item of variantItems) {
    const data = variantDataMap.get(item.sku);
    if (!data) {
      const error = new Error(
        `Variant ${item.sku} not found in data from Storefront API`
      );
      logger.error(error.message);
      throw error;
    }

    try {
      const product = transformVariant(
        googleFeedLabel,
        data.parentProduct,
        data.variant,
        language,
        country,
        storeUrlTemplate
      );
      transformed.push(product);
    } catch (error) {
      logger.error(`Failed to transform variant ${item.sku}: ${error.message}`);
      throw error;
    }
  }

  return transformed;
};

/**
 * Transforms simple product structures for Google Merchant Center.
 *
 * @param {string} googleFeedLabel - The Google feed label
 * @param {string} language - ISO 639-1 content language code
 * @param {string} country - ISO 3166-1 alpha-2 target country code
 * @param {string} storeUrlTemplate - The store URL template
 * @param {object[]} simpleItems - Simple product event items
 * @param {Map<string, object>} productMap - Product data
 * @param {object} logger - The logger to use
 * @returns {IProductInput[]} Transformed products
 * @throws {Error} If a product is not found or fails to transform
 */
const transformSimpleItems = (
  googleFeedLabel,
  language,
  country,
  storeUrlTemplate,
  simpleItems,
  productMap,
  logger
) => {
  const transformed = [];

  for (const item of simpleItems) {
    const product = productMap.get(item.sku);
    if (!product) {
      const error = new Error(`Product ${item.sku} not found in Commerce`);
      logger.error(error.message);
      throw error;
    }

    // Skip complex product parent SKUs - only their variants should be sent to GMC
    if (isComplexProduct(product)) {
      logger.info(
        `Skipping complex product parent ${item.sku} - only variants are sent to GMC`
      );
      continue;
    }

    try {
      const googleProduct = transformProduct(
        googleFeedLabel,
        product,
        language,
        country,
        storeUrlTemplate
      );
      transformed.push(googleProduct);
    } catch (error) {
      logger.error(`Failed to transform product ${item.sku}: ${error.message}`);
      throw error;
    }
  }

  return transformed;
};

/**
 * Fetches products from Commerce and transforms them for Google Merchant Center.
 *
 * @param {import('../../types/config').FeedConfig} feedConfig - The feed configuration
 * @param {string} tenantId - The tenant ID
 * @param {object[]} items - Event items to process
 * @param {Logger} logger - The logger to use
 * @returns {Promise<IProductInput[]>} Array of transformed Google product inputs
 * @throws {Error} If fetching or transforming fails
 */
const fetchAndTransformProducts = async (
  feedConfig,
  tenantId,
  items,
  logger
) => {
  const {
    acoApiBaseUrl: baseUrl,
    acoPriceBookId: priceBookId,
    acoViewId: viewId,
    googleFeedLabel,
    googleContentLanguage: language,
    googleTargetCountry: country,
    storeUrlTemplate,
  } = feedConfig;
  const { complexVariantItems, simpleItems, complexParentSkus } =
    categorizeItems(items);

  logger.info(
    `Categorized: ${complexVariantItems.length} variants, ${simpleItems.length} simple products, ${complexParentSkus.length} parents (skipped)`
  );

  const [variantDataMap, simpleProductMap] = await Promise.all([
    fetchVariantData(
      baseUrl,
      priceBookId,
      viewId,
      tenantId,
      complexParentSkus,
      logger
    ),
    fetchSimpleProducts(
      baseUrl,
      priceBookId,
      viewId,
      tenantId,
      simpleItems.map((i) => i.sku),
      logger
    ),
  ]);

  const transformedVariants = transformVariantItems(
    googleFeedLabel,
    language,
    country,
    storeUrlTemplate,
    complexVariantItems,
    variantDataMap,
    logger
  );
  const transformedSimple = transformSimpleItems(
    googleFeedLabel,
    language,
    country,
    storeUrlTemplate,
    simpleItems,
    simpleProductMap,
    logger
  );

  return [...transformedVariants, ...transformedSimple];
};

/**
 * Extracts SKUs to delete, excluding complex parent products.
 *
 * @param {object[]} items - Event items to delete
 * @returns {string[]} Array of SKUs for deletion
 */
const prepareSkusToDelete = (items) => {
  const parentSkus = new Set();
  for (const item of items) {
    const variantOfLink = getVariantOfLink(item);
    if (variantOfLink) {
      parentSkus.add(variantOfLink.sku);
    }
  }

  const skus = [];
  for (const item of items) {
    if (!parentSkus.has(item.sku)) {
      skus.push(item.sku);
    }
  }

  return skus;
};

/**
 * Process a product event for a given tenant.
 *
 * @param {string} tenantId - The tenant ID
 * @param {object[]} items - The items to process
 * @param {import('../../types/config').FeedConfig} feedConfig - The feed configuration
 * @param {Logger} logger - The logger to use
 * @throws {Error} If fetching, transforming, or sending to Google fails
 */
const processProductEvent = async (tenantId, items, feedConfig, logger) => {
  const { create, update, delete: deleteOps } = groupByOperation(items);
  logger.info(
    `Processing ${create.length} creates, ${update.length} updates, ${deleteOps.length} deletes`
  );

  // Combine create and update operations - Google's insertProductInput is an upsert
  // that handles both cases. This avoids NOT_FOUND errors when a product exists in
  // ACO (update event) but not yet in GMC.
  const upsertItems = [...create, ...update];
  if (upsertItems.length > 0) {
    const productsToUpsert = await fetchAndTransformProducts(
      feedConfig,
      tenantId,
      upsertItems,
      logger
    );
    if (productsToUpsert.length > 0) {
      await upsertProducts(
        feedConfig.googleCredsJson,
        feedConfig.googleMerchantId,
        feedConfig.googleDataSourceId,
        productsToUpsert,
        logger
      );
    }
  }

  if (deleteOps.length > 0) {
    const skusToDelete = prepareSkusToDelete(deleteOps);
    if (skusToDelete.length > 0) {
      await deleteProducts(
        feedConfig.googleCredsJson,
        feedConfig.googleMerchantId,
        feedConfig.googleDataSourceId,
        feedConfig.googleFeedLabel,
        feedConfig.googleContentLanguage,
        skusToDelete,
        logger
      );
    }
  }
};

module.exports = {
  processProductEvent,
};

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

const { chunk, groupByOperation } = require("../../actions/utils.js");
const { getProducts, getVariants } = require("../../clients/commerce.js");
const {
  insertProducts,
  updateProducts,
  deleteProducts,
} = require("../../clients/google.js");
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
 * @param {string} storeUrlTemplate - The store URL template
 * @param {object[]} items - Items with sku and sources
 * @param {Map<string, {parentProduct: object, variant: object}>} variantDataMap - Variant data
 * @param {Logger} logger - The logger to use
 * @returns {IProductInput[]} Array of transformed Google product inputs
 */
const transformVariantItems = (
  googleFeedLabel,
  storeUrlTemplate,
  variantItems,
  variantDataMap,
  logger
) => {
  const transformed = [];
  for (const item of variantItems) {
    const data = variantDataMap.get(item.sku);
    if (!data) {
      logger.error(
        `Product ${item.sku} not found in data from Storefront API. Skipping.`
      );
      continue;
    }

    for (const source of item.sources) {
      try {
        const product = transformVariant(
          googleFeedLabel,
          data.parentProduct,
          data.variant,
          source,
          storeUrlTemplate
        );
        transformed.push(product);
      } catch (error) {
        logger.error(
          `Failed to transform variant ${item.sku}: ${error.message}`
        );
      }
    }
  }
  return transformed;
};

/**
 * Transforms simple product structures for Google Merchant Center.
 *
 * @param {string} googleFeedLabel - The Google feed label
 * @param {string} storeUrlTemplate - The store URL template
 * @param {object[]} simpleItems - Simple product event items
 * @param {Map<string, object>} productMap - Product data
 * @param {object} logger - The logger to use
 * @returns {IProductInput[]} Transformed products
 */
const transformSimpleItems = (
  googleFeedLabel,
  storeUrlTemplate,
  simpleItems,
  productMap,
  logger
) => {
  const transformed = [];
  for (const item of simpleItems) {
    const product = productMap.get(item.sku);
    if (!product) {
      logger.error(
        `Simple product ${item.sku} not found in Commerce. Skipping.`
      );
      continue;
    }

    for (const source of item.sources) {
      try {
        const googleProduct = transformProduct(
          googleFeedLabel,
          product,
          source,
          storeUrlTemplate
        );
        transformed.push(googleProduct);
      } catch (error) {
        logger.error(
          `Failed to transform product ${item.sku}: ${error.message}`
        );
      }
    }
  }
  return transformed;
};

/**
 * Fetches products from Commerce and transforms them for Google Merchant Center.
 *
 * @param {object} params - The parameters for the request
 * @param {string} tenantId - The tenant ID
 * @param {object[]} items - Event items to process
 * @param {Logger} logger - The logger to use
 * @returns {Promise<IProductInput[]>} Array of transformed Google product inputs
 */
const fetchAndTransformProducts = async (params, tenantId, items, logger) => {
  const {
    ACO_API_BASE_URL: baseUrl,
    ACO_PRICE_BOOK_ID: priceBookId,
    ACO_VIEW_ID: viewId,
    GOOGLE_FEED_LABEL: googleFeedLabel,
    STORE_URL_TEMPLATE: storeUrlTemplate,
  } = params;
  const { complexVariantItems, simpleItems, complexParentSkus } =
    categorizeItems(items);

  logger.info(
    `Categorized: ${complexVariantItems.length} variants, ${simpleItems.length} simple products, ${complexParentSkus.length} parents (skipped)`
  );

  // TODO: Right now we support one view id from env vars.
  // We should support multiple and look them up via the ACO Admin API.
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

  // TODO: Right now we are using the source from the catalog event.
  // This may not be ideal if the customer has multiple country targets under the same source.
  // We may want to take an input (in env vars) of the desired country and language targets to be explicit.
  const transformedVariants = transformVariantItems(
    googleFeedLabel,
    storeUrlTemplate,
    complexVariantItems,
    variantDataMap,
    logger
  );
  const transformedSimple = transformSimpleItems(
    googleFeedLabel,
    storeUrlTemplate,
    simpleItems,
    simpleProductMap,
    logger
  );

  return [...transformedVariants, ...transformedSimple];
};

/**
 * Removes complex parent products from the items to delete
 *
 * @param {object[]} items - Event items to delete
 * @returns {Array<{sku: string, source: object}>} Flattened items for deletion
 */
const prepareItemsToDelete = (items) => {
  // Find parent SKUs to exclude
  const parentSkus = new Set();
  for (const item of items) {
    const variantOfLink = getVariantOfLink(item);
    if (variantOfLink) {
      parentSkus.add(variantOfLink.sku);
    }
  }

  // Only include items that are not parents
  const deleteItems = [];
  for (const item of items) {
    if (parentSkus.has(item.sku)) continue; // Skip parent products

    for (const source of item.sources) {
      deleteItems.push({ sku: item.sku, source });
    }
  }

  return deleteItems;
};

/**
 * Process a product event for a given tenant.
 *
 * @param {string} tenantId - The tenant ID
 * @param {object[]} items - The items to process
 * @param {object} params - The parameters for the request
 * @param {Logger} logger - The logger to use
 */
const processProductEvent = async (tenantId, items, params, logger) => {
  const { create, update, delete: deleteOps } = groupByOperation(items);
  logger.info(
    `Processing ${create.length} creates, ${update.length} updates, ${deleteOps.length} deletes`
  );

  // Handle creates
  if (create.length > 0) {
    const productsToInsert = await fetchAndTransformProducts(
      params,
      tenantId,
      create,
      logger
    );
    if (productsToInsert.length > 0) {
      await insertProducts(
        params.GOOGLE_CREDS_PATH,
        params.GOOGLE_MERCHANT_ID,
        params.GOOGLE_DATA_SOURCE_ID,
        productsToInsert,
        logger
      );
    }
  }

  // Handle updates
  if (update.length > 0) {
    const productsToUpdate = await fetchAndTransformProducts(
      params,
      tenantId,
      update,
      logger
    );
    if (productsToUpdate.length > 0) {
      await updateProducts(
        params.GOOGLE_CREDS_PATH,
        params.GOOGLE_MERCHANT_ID,
        params.GOOGLE_DATA_SOURCE_ID,
        productsToUpdate,
        logger
      );
    }
  }

  // Handle deletes
  if (deleteOps.length > 0) {
    const deleteItems = prepareItemsToDelete(deleteOps);
    if (deleteItems.length > 0) {
      await deleteProducts(
        params.GOOGLE_CREDS_PATH,
        params.GOOGLE_MERCHANT_ID,
        params.GOOGLE_DATA_SOURCE_ID,
        params.GOOGLE_FEED_LABEL,
        deleteItems,
        logger
      );
    }
  }
};

module.exports = {
  processProductEvent,
};

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
 * Price event processor for Google Merchant Center.
 *
 * Price events are handled differently from product events:
 * - All price operations (create, update, delete) trigger a product refresh
 * - We fetch fresh product data from Commerce API and upsert to GMC
 * - Price events NEVER trigger product deletions in GMC
 */

const { upsertProducts } = require("../../clients/google.js");
const {
  fetchSimpleProducts,
  transformSimpleItems,
} = require("./products.js");

/**
 * Extracts unique SKUs from price event items and converts to item format.
 *
 * @param {object[]} items - Price event items
 * @returns {object[]} Array of unique items with sku property
 */
const extractUniqueItems = (items) => {
  const seen = new Set();
  const uniqueItems = [];
  for (const item of items) {
    if (item.sku && !seen.has(item.sku)) {
      seen.add(item.sku);
      uniqueItems.push({ sku: item.sku });
    }
  }
  return uniqueItems;
};

/**
 * Process a price event for a given tenant.
 *
 * All price operations (create, update, delete) are treated as product refreshes.
 * We fetch the current product data from Commerce and upsert to GMC.
 * Price events NEVER trigger product deletions.
 *
 * @param {string} tenantId - The tenant ID
 * @param {object[]} items - The price event items to process
 * @param {import('../../types/config').FeedConfig} feedConfig - The feed configuration
 * @param {Logger} logger - The logger to use
 * @throws {Error} If fetching products from Commerce fails
 */
const processPriceEvent = async (tenantId, items, feedConfig, logger) => {
  const {
    acoApiBaseUrl: baseUrl,
    acoPriceBookId: priceBookId,
    acoViewId: viewId,
    googleFeedLabel,
    googleContentLanguage: language,
    googleTargetCountry: country,
    storeUrlTemplate,
  } = feedConfig;

  const uniqueItems = extractUniqueItems(items);
  logger.info(
    `Processing price event: ${items.length} items, ${uniqueItems.length} unique SKUs`
  );

  if (uniqueItems.length === 0) {
    logger.info("No SKUs to process in price event");
    return;
  }

  // Fetch fresh product data from Commerce API
  const productMap = await fetchSimpleProducts(
    baseUrl,
    priceBookId,
    viewId,
    tenantId,
    uniqueItems.map((item) => item.sku),
    logger
  );

  // Transform products for GMC
  const productsToUpsert = transformSimpleItems(
    googleFeedLabel,
    language,
    country,
    storeUrlTemplate,
    uniqueItems,
    productMap,
    logger
  );

  // Upsert changes to GMC
  if (productsToUpsert.length > 0) {
    await upsertProducts(
      feedConfig.googleCredsJson,
      feedConfig.googleMerchantId,
      feedConfig.googleDataSourceId,
      productsToUpsert,
      logger
    );
  } else {
    logger.info("No products to upsert after transformation");
  }
};

module.exports = {
  processPriceEvent,
};

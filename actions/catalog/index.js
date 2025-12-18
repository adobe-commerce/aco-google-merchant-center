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

const { Core } = require("@adobe/aio-sdk");
const {
  ACO_EVENT_TYPE_PRODUCT,
  ACO_EVENT_TYPE_PRICE,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
} = require("../constants.js");
const { errorResponse, successResponse } = require("../responses.js");
const {
  checkMissingRequestInputs,
  chunk,
  groupByOperation,
  groupBySourceLocale,
  stringParameters,
} = require("../utils.js");
const { getProducts } = require("../../clients/commerce.js");
const {
  insertProducts,
  updateProducts,
  deleteProducts,
} = require("../../clients/google.js");
const { transformProduct } = require("../../transformers/product.js");

const BATCH_SIZE = 25;

/**
 * Fetches products from Commerce in batches and transforms them.
 *
 * @param {object} params - The parameters for the request
 * @param {string} tenantId - The tenant ID
 * @param {object[]} items - Items with sku and sources to fetch
 * @param {Logger} logger - The logger to use
 * @returns {Promise<object[]>} Array of transformed Google product inputs
 */
const fetchAndTransformProducts = async (params, tenantId, items, logger) => {
  const {
    ACO_API_BASE_URL,
    ACO_PRICE_BOOK_ID,
    ACO_VIEW_ID,
    GOOGLE_FEED_LABEL,
    STORE_URL_TEMPLATE,
  } = params;
  const itemsBySource = groupBySourceLocale(items);
  const transformedProducts = [];

  for (const [locale, { source, items: sourceItems }] of Object.entries(
    itemsBySource
  )) {
    const skus = sourceItems.map((item) => item.sku);
    const skuBatches = chunk(skus, BATCH_SIZE);

    logger.info(
      `Fetching ${skus.length} products for locale ${locale} in ${skuBatches.length} batch(es)`
    );

    for (const skuBatch of skuBatches) {
      const products = await getProducts(
        ACO_API_BASE_URL,
        ACO_VIEW_ID,
        ACO_PRICE_BOOK_ID,
        tenantId,
        skuBatch,
        source
      );

      for (const product of products) {
        const googleProduct = transformProduct(
          GOOGLE_FEED_LABEL,
          product,
          source,
          STORE_URL_TEMPLATE
        );
        transformedProducts.push(googleProduct);
      }
    }
  }

  return transformedProducts;
};

/**
 * Prepares delete items with flattened source information.
 *
 * @param {object[]} items - Items to delete with sku and sources
 * @returns {Array<{sku: string, source: object}>} Flattened items for deletion
 */
const prepareDeleteItems = (items) => {
  const deleteItems = [];
  for (const item of items) {
    for (const source of item.sources) {
      deleteItems.push({ sku: item.sku, source });
    }
  }
  return deleteItems;
};

/**
 * Process a product event for a given tenant using batched operations.
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
    await insertProducts(
      params.GOOGLE_CREDS_PATH,
      params.GOOGLE_MERCHANT_ID,
      params.GOOGLE_DATA_SOURCE_ID,
      productsToInsert,
      logger
    );
  }

  // Handle updates
  if (update.length > 0) {
    const productsToUpdate = await fetchAndTransformProducts(
      params,
      tenantId,
      update,
      logger
    );
    await updateProducts(
      params.GOOGLE_CREDS_PATH,
      params.GOOGLE_MERCHANT_ID,
      params.GOOGLE_DATA_SOURCE_ID,
      productsToUpdate,
      logger
    );
  }

  // Handle deletes
  if (deleteOps.length > 0) {
    const deleteItems = prepareDeleteItems(deleteOps);
    await deleteProducts(
      params.GOOGLE_CREDS_PATH,
      params.GOOGLE_MERCHANT_ID,
      params.GOOGLE_DATA_SOURCE_ID,
      params.GOOGLE_FEED_LABEL,
      deleteItems,
      logger
    );
  }
};

/**
 * Main function that processes the incoming event.
 *
 * @param {object} params - Input parameters containing product data and request info.
 * @returns {object} - Success or error response based on processing.
 */
const main = async (params) => {
  const logger = Core.Logger("catalog-event-consumer", {
    level: params.LOG_LEVEL || "info",
  });

  logger.info(`Processing catalog event for tenant: ${params.data.instanceId}`);

  // Check for missing environment variables
  const requiredEnv = [
    "ACO_API_BASE_URL",
    "ACO_PRICE_BOOK_ID",
    "ACO_VIEW_ID",
    "GOOGLE_MERCHANT_ID",
    "GOOGLE_DATA_SOURCE_ID",
    "GOOGLE_FEED_LABEL",
    "GOOGLE_CREDS_PATH",
    "STORE_URL_TEMPLATE",
  ];
  const missingEnv = checkMissingRequestInputs(params, requiredEnv, []);
  if (missingEnv) {
    logger.error(`Missing environment variables: ${missingEnv}`);
    return errorResponse(HTTP_INTERNAL_ERROR, missingEnv);
  }

  // Check for missing event data parameters
  const requiredParams = ["type", "data.instanceId", "data.items"];
  const missingParams = checkMissingRequestInputs(params, requiredParams, []);
  if (missingParams) {
    logger.error(`Invalid event parameters: ${stringParameters(params)}`);
    return errorResponse(HTTP_BAD_REQUEST, missingParams);
  }

  try {
    const { type, data } = params;
    const { instanceId: tenantId, items: items } = data;
    if ([ACO_EVENT_TYPE_PRODUCT, ACO_EVENT_TYPE_PRICE].includes(type)) {
      await processProductEvent(tenantId, items, params, logger);
    } else {
      logger.error(`Invalid event type: ${type}`);
      return errorResponse(HTTP_BAD_REQUEST, `Invalid event type: ${type}`);
    }

    return successResponse(
      type,
      `Processed ${items.length} items for tenant: ${tenantId}`
    );
  } catch (error) {
    logger.error(`Could not process catalog event. Error: ${error.message}`);
    return errorResponse(HTTP_INTERNAL_ERROR, error.message);
  }
};

exports.main = main;

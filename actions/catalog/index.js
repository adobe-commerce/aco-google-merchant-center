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
 * @typedef {import('../../types/config').MarketConfig} MarketConfig
 * @typedef {import('../../types/config').FeedConfig} FeedConfig
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
  groupItemsByMarket,
  stringParameters,
} = require("../utils.js");
const { loadMarketConfig, buildLocaleIndex } = require("../config.js");
const { processProductEvent } = require("../../processors/aco/products.js");

/**
 * Filters price event items to only include those matching the market's price book.
 */
const filterPriceItemsForMarket = (items, priceBookId) => {
  return items.filter((item) =>
    item.sources?.some((source) => source.priceBookId === priceBookId)
  );
};

/**
 * Builds feed configuration from action params and market config.
 *
 * @param {object} params - Action input params
 * @param {MarketConfig} market - Market configuration
 * @returns {FeedConfig}
 */
const buildFeedConfig = (params, market) => {
  return {
    acoApiBaseUrl: params.ACO_API_BASE_URL,
    acoViewId: market.aco.viewId,
    acoPriceBookId: market.aco.priceBookId,
    googleCredsPath: params.GOOGLE_CREDS_PATH,
    googleMerchantId: market.google.merchantId,
    googleDataSourceId: market.google.dataSourceId,
    googleFeedLabel: market.google.feedLabel,
    googleContentLanguage: market.google.contentLanguage,
    googleTargetCountry: market.google.targetCountry,
    storeUrlTemplate: market.store.urlTemplate,
  };
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

  logger.info(
    `Processing catalog event for tenant: ${params.data?.instanceId}`
  );

  const requiredEnv = [
    "ACO_API_BASE_URL",
    "ACO_TENANT_ID",
    "GOOGLE_CREDS_PATH",
  ];
  const missingEnv = checkMissingRequestInputs(params, requiredEnv, []);
  if (missingEnv) {
    logger.error(`Missing environment variables: ${missingEnv}`);
    return errorResponse(HTTP_INTERNAL_ERROR, missingEnv);
  }

  const requiredParams = ["type", "data.instanceId", "data.items"];
  const missingParams = checkMissingRequestInputs(params, requiredParams, []);
  if (missingParams) {
    logger.error(`Invalid event parameters: ${stringParameters(params)}`);
    return errorResponse(HTTP_BAD_REQUEST, missingParams);
  }

  try {
    const { type, data } = params;
    const { instanceId: tenantId, items } = data;
    const expectedTenantId = params.ACO_TENANT_ID;

    // Check if the event tenant ID matches the expected tenant ID
    if (tenantId !== expectedTenantId) {
      logger.error(
        `Event tenant ID ${tenantId} does not match expected tenant ID ${expectedTenantId}`
      );
      return errorResponse(
        HTTP_BAD_REQUEST,
        `Event tenant ID ${tenantId} does not match expected tenant ID ${expectedTenantId}`
      );
    }

    const marketConfig = loadMarketConfig();
    logger.debug(`Loaded configuration for ${marketConfig.length} markets`);
    const localeIndex = buildLocaleIndex(marketConfig);
    // Group the event items by the configured markets
    const itemsByMarket = groupItemsByMarket(items, localeIndex, logger);

    if (itemsByMarket.size === 0) {
      logger.info(
        "No event items matched configured markets, skipping processing"
      );
      return successResponse(type, "No event items matched configured markets");
    }

    for (const [marketId, { market, items: marketItems }] of itemsByMarket) {
      logger.info(
        `Processing ${marketItems.length} items for market: ${marketId}`
      );
      const feedConfig = buildFeedConfig(params, market);

      if (type === ACO_EVENT_TYPE_PRODUCT) {
        await processProductEvent(tenantId, marketItems, feedConfig, logger);
      } else if (type === ACO_EVENT_TYPE_PRICE) {
        // Filter price event items to only include those matching the market's price book
        const validItems = filterPriceItemsForMarket(
          marketItems,
          market.aco.priceBookId
        );
        if (validItems.length > 0) {
          logger.info(
            `Processing ${validItems.length} of ${marketItems.length} price events for market ${marketId}`
          );
          // Price events are processed the same way as product events
          await processProductEvent(tenantId, validItems, feedConfig, logger);
        } else {
          logger.info(`No price events for market ${marketId} price book`);
        }
      } else {
        logger.error(`Invalid event type: ${type}`);
        return errorResponse(HTTP_BAD_REQUEST, `Invalid event type: ${type}`);
      }
    }

    const totalProcessed = [...itemsByMarket.values()].reduce(
      (sum, { items }) => sum + items.length,
      0
    );
    return successResponse(
      type,
      `Processed ${totalProcessed} items across ${itemsByMarket.size} markets for tenant: ${tenantId}`
    );
  } catch (error) {
    logger.error(`Could not process catalog event. Error: ${error.message}`);
    return errorResponse(HTTP_INTERNAL_ERROR, error.message);
  }
};

exports.main = main;

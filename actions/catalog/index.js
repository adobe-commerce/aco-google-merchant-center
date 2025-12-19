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
const { checkMissingRequestInputs, stringParameters } = require("../utils.js");
const { processProductEvent } = require("../../processors/aco/products.js");
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
    const { instanceId: tenantId, items } = data;

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

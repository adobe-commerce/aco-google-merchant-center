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
 * Google Merchant Center client for inserting products.
 *
 * @typedef {import('@google-shopping/products').protos.google.shopping.merchant.products.v1.IProductInput} IProductInput
 */

const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");
const { ProductInputsServiceClient } = require("@google-shopping/products").v1;
const { PRODUCT_FIELD_MASKS } = require("../transformers/product");

const SCOPES = ["https://www.googleapis.com/auth/content"];

/**
 * Gets credentials configuration.
 *
 * @param {string} credsPath - Path to the service account JSON file
 * @param {string} merchantId - The Merchant Center account ID
 * @returns {{serviceAccountFile: string, merchantId: string}}
 */
const getConfig = (credsPath, merchantId) => {
  const serviceAccountFile = path.isAbsolute(credsPath)
    ? credsPath
    : path.resolve(process.cwd(), credsPath);

  return { serviceAccountFile, merchantId };
};

/**
 * Gets authentication credentials using a service account.
 *
 * @param {string} serviceAccountFile - Path to the service account JSON file
 * @returns {Promise<GoogleAuth>} Authenticated GoogleAuth instance
 */
const getCredentials = async (serviceAccountFile) => {
  if (!fs.existsSync(serviceAccountFile)) {
    throw new Error(
      `Service account file does not exist at: ${serviceAccountFile}`
    );
  }

  return new GoogleAuth({
    keyFilename: serviceAccountFile,
    scopes: SCOPES,
  });
};

/**
 * Inserts multiple products into Google Merchant Center concurrently.
 *
 * @param {string} credsPath - Path to the service account JSON file
 * @param {string} merchantId - The Merchant Center account ID
 * @param {string} dataSourceId - The data source ID to insert the products into
 * @param {IProductInput[]} productInputs - Array of product inputs from transformer
 * @param {Logger} logger - The logger to use
 * @returns {Promise<object[]>} Array of inserted product responses
 */
const insertProducts = async (
  credsPath,
  merchantId,
  dataSourceId,
  productInputs,
  logger
) => {
  if (productInputs.length === 0) return [];

  const config = getConfig(credsPath, merchantId);
  const authClient = await getCredentials(config.serviceAccountFile);

  const client = new ProductInputsServiceClient({ authClient });
  const parent = `accounts/${merchantId}`;
  const dataSource = `accounts/${merchantId}/dataSources/${dataSourceId}`;

  const requests = productInputs.map((productInput) => ({
    parent,
    dataSource,
    productInput,
  }));

  logger.info(`Inserting ${requests.length} products concurrently`);

  const insertPromises = requests.map((request) =>
    client.insertProductInput(request)
  );
  const results = await Promise.all(insertPromises);
  logger.info(`Response from Google: ${JSON.stringify(results)}`);
  const insertedProducts = results.map((result) => result[0]);

  logger.info(`Successfully inserted ${insertedProducts.length} products`);
  return insertedProducts;
};

/**
 * Updates multiple products in Google Merchant Center concurrently.
 *
 * @param {string} credsPath - Path to the service account JSON file
 * @param {string} merchantId - The Merchant Center account ID
 * @param {string} dataSourceId - The data source ID
 * @param {IProductInput[]} productInputs - Array of product inputs from transformer
 * @param {Logger} logger - The logger to use
 * @returns {Promise<object[]>} Array of updated product responses
 */
const updateProducts = async (
  credsPath,
  merchantId,
  dataSourceId,
  productInputs,
  logger
) => {
  if (productInputs.length === 0) return [];

  const config = getConfig(credsPath, merchantId);
  const authClient = await getCredentials(config.serviceAccountFile);

  const client = new ProductInputsServiceClient({ authClient });
  const dataSource = `accounts/${merchantId}/dataSources/${dataSourceId}`;

  const requests = productInputs.map((productInput) => {
    const productId = `${productInput.contentLanguage}~${productInput.feedLabel}~${productInput.offerId}`;
    return {
      productInput: {
        name: `accounts/${merchantId}/productInputs/${productId}`,
        ...productInput,
      },
      updateMask: { paths: PRODUCT_FIELD_MASKS },
      dataSource,
    };
  });

  logger.info(`Updating ${requests.length} products concurrently`);

  const updatePromises = requests.map((request) =>
    client.updateProductInput(request)
  );
  const results = await Promise.all(updatePromises);
  logger.info(`Response from Google: ${JSON.stringify(results)}`);
  const updatedProducts = results.map((result) => result[0]);

  logger.info(`Successfully updated ${updatedProducts.length} products`);
  return updatedProducts;
};

/**
 * Deletes multiple products from Google Merchant Center concurrently.
 *
 * @param {string} credsPath - Path to the service account JSON file
 * @param {string} merchantId - The Merchant Center account ID
 * @param {string} dataSourceId - The data source ID
 * @param {string} feedLabel - The feed label for the products
 * @param {Array<{sku: string, source: object}>} items - Array of items to delete with sku and source
 * @param {Logger} logger - The logger to use
 * @returns {Promise<void>}
 */
const deleteProducts = async (
  credsPath,
  merchantId,
  dataSourceId,
  feedLabel,
  items,
  logger
) => {
  if (items.length === 0) return;

  const config = getConfig(credsPath, merchantId);
  const authClient = await getCredentials(config.serviceAccountFile);

  const client = new ProductInputsServiceClient({ authClient });
  const dataSource = `accounts/${merchantId}/dataSources/${dataSourceId}`;

  const requests = items.map(({ sku, source }) => {
    const language = source.locale.split("-")[0];
    const productId = `${language}~${feedLabel}~${sku}`;
    return {
      name: `accounts/${merchantId}/productInputs/${productId}`,
      dataSource,
    };
  });

  logger.info(`Deleting ${requests.length} products concurrently`);

  const deletePromises = requests.map((request) =>
    client.deleteProductInput(request)
  );
  await Promise.all(deletePromises);

  logger.info(`Successfully deleted ${items.length} products`);
};

module.exports = {
  insertProducts,
  updateProducts,
  deleteProducts,
};

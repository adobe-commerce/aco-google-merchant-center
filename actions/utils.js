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

/* This file exposes some common utilities for your actions */

/**
 *
 * Returns a log ready string of the action input parameters.
 * The `Authorization` header content will be replaced by '<hidden>'.
 *
 * @param {object} params action input parameters.
 *
 * @returns {string}
 *
 */
function stringParameters(params) {
  // hide authorization token without overriding params
  let headers = params.__ow_headers || {};
  if (headers.authorization) {
    headers = { ...headers, authorization: "<hidden>" };
  }
  return JSON.stringify({ ...params, __ow_headers: headers });
}

/**
 *
 * Returns the list of missing keys giving an object and its required keys.
 * A parameter is missing if its value is undefined or ''.
 * A value of 0 or null is not considered as missing.
 *
 * @param {object} obj object to check.
 * @param {array} required list of required keys.
 *        Each element can be multi level deep using a '.' separator e.g. 'myRequiredObj.myRequiredKey'
 *
 * @returns {array}
 * @private
 */
function getMissingKeys(obj, required) {
  return required.filter((r) => {
    const splits = r.split(".");
    const last = splits[splits.length - 1];
    const traverse = splits.slice(0, -1).reduce((tObj, split) => {
      tObj = tObj[split] || {};
      return tObj;
    }, obj);
    return traverse[last] === undefined || traverse[last] === ""; // missing default params are empty string
  });
}

/**
 *
 * Returns the list of missing keys giving an object and its required keys.
 * A parameter is missing if its value is undefined or ''.
 * A value of 0 or null is not considered as missing.
 *
 * @param {object} params action input parameters.
 * @param {array} requiredHeaders list of required input headers.
 * @param {array} requiredParams list of required input parameters.
 *        Each element can be multi level deep using a '.' separator e.g. 'myRequiredObj.myRequiredKey'.
 *
 * @returns {string} if the return value is not null, then it holds an error message describing the missing inputs.
 *
 */
function checkMissingRequestInputs(
  params,
  requiredParams = [],
  requiredHeaders = []
) {
  let errorMessage = null;

  // input headers are always lowercase
  requiredHeaders = requiredHeaders.map((h) => h.toLowerCase());
  // check for missing headers
  const missingHeaders = getMissingKeys(
    params.__ow_headers || {},
    requiredHeaders
  );
  if (missingHeaders.length > 0) {
    errorMessage = `missing header(s) '${missingHeaders}'`;
  }

  // check for missing parameters
  const missingParams = getMissingKeys(params, requiredParams);
  if (missingParams.length > 0) {
    if (errorMessage) {
      errorMessage += " and ";
    } else {
      errorMessage = "";
    }
    errorMessage += `missing parameter(s) '${missingParams}'`;
  }

  return errorMessage;
}

/**
 *
 * Extracts the bearer token string from the Authorization header in the request parameters.
 *
 * @param {object} params action input parameters.
 *
 * @returns {string|undefined} the token string or undefined if not set in request headers.
 *
 */
function getBearerToken(params) {
  if (
    params.__ow_headers &&
    params.__ow_headers.authorization &&
    params.__ow_headers.authorization.startsWith("Bearer ")
  ) {
    return params.__ow_headers.authorization.substring("Bearer ".length);
  }
  return undefined;
}

/**
 * Splits an array into chunks of a specified size.
 *
 * @param {Array} array - The array to chunk
 * @param {number} size - The chunk size
 * @returns {Array[]} Array of chunks
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Groups items by operation type.
 *
 * @param {object[]} items - The items to group
 * @returns {{create: object[], update: object[], delete: object[]}}
 */
function groupByOperation(items) {
  return items.reduce(
    (acc, item) => {
      const { operation } = item;
      if (acc[operation]) {
        acc[operation].push(item);
      }
      return acc;
    },
    { create: [], update: [], delete: [] }
  );
}

/**
 * Groups items by their source locale.
 *
 * @param {object[]} items - Items with sources array containing locale
 * @returns {Object<string, {source: object, items: object[]}>} Items grouped by locale
 */
function groupBySourceLocale(items) {
  return items.reduce((acc, item) => {
    for (const source of item.sources) {
      const key = source.locale;
      if (!acc[key]) {
        acc[key] = { source, items: [] };
      }
      acc[key].items.push(item);
    }
    return acc;
  }, {});
}

module.exports = {
  checkMissingRequestInputs,
  chunk,
  getBearerToken,
  groupByOperation,
  groupBySourceLocale,
  stringParameters,
};

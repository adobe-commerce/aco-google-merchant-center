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
 * @typedef {import('../types/config').MarketConfig} MarketConfig
 * @typedef {import('../types/config').MarketsConfig} MarketsConfig
 */

const Ajv = require("ajv");

const schema = require("../config/markets.schema.json");

let config;
try {
  config = require("../config/markets.json");
} catch (e) {
  throw new Error(
    "Market configuration file not found. Please create config/markets.json from config/markets.example.json"
  );
}

/**
 * Loads and validates market configuration.
 *
 * @returns {MarketConfig[]} The validated array of market configs
 * @throws {Error} If validation fails
 */
const loadMarketConfig = () => {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  if (!validate(config)) {
    const errors = validate.errors
      .map((err) => `${err.instancePath} ${err.message}`)
      .join("; ");
    throw new Error(`Invalid market config: ${errors}`);
  }

  return config;
};

/**
 * Builds a locale-to-markets lookup map for fast event routing.
 * A single locale can map to multiple markets.
 *
 * @param {MarketConfig[]} markets - Array of market configurations
 * @returns {Map<string, MarketConfig[]>} Map of lowercase locale to array of market configs
 */
const buildLocaleIndex = (markets) => {
  const index = new Map();

  for (const market of markets) {
    const locale = market.aco.source.locale.toLowerCase();
    if (!index.has(locale)) {
      index.set(locale, []);
    }
    index.get(locale).push(market);
  }

  return index;
};

module.exports = {
  loadMarketConfig,
  buildLocaleIndex,
};

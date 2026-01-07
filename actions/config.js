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
 * @typedef {import('../types/config').AttributeMappingConfig} AttributeMappingConfig
 */

const Ajv = require("ajv");

const marketSchema = require("../config/markets/markets.schema.json");
const attributeMappingSchema = require("../config/attributeMapping/attributeMapping.schema.json");

let marketConfig;
try {
  marketConfig = require("../config/markets/markets.json");
} catch (e) {
  throw new Error(
    "Market configuration file not found. Please create config/markets/markets.json from config/markets/markets.example.json"
  );
}

let attributeMappingConfig;
try {
  attributeMappingConfig = require("../config/attributeMapping/attributeMapping.json");
} catch (e) {
  throw new Error(
    "Attribute mapping configuration file not found. Please create config/attributeMapping/attributeMapping.json from config/attributeMapping/attributeMapping.example.json"
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
  const validate = ajv.compile(marketSchema);

  if (!validate(marketConfig)) {
    const errors = validate.errors
      .map((err) => `${err.instancePath} ${err.message}`)
      .join("; ");
    throw new Error(`Invalid market config: ${errors}`);
  }

  return marketConfig;
};

/**
 * Loads and validates attribute mapping configuration.
 *
 * @returns {AttributeMappingConfig} The validated attribute mapping config
 * @throws {Error} If validation fails
 */
const loadAttributeMappingConfig = () => {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(attributeMappingSchema);

  if (!validate(attributeMappingConfig)) {
    const errors = validate.errors
      .map((err) => `${err.instancePath} ${err.message}`)
      .join("; ");
    throw new Error(`Invalid attribute mapping config: ${errors}`);
  }

  return attributeMappingConfig;
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
  loadAttributeMappingConfig,
  buildLocaleIndex,
};

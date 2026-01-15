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

export interface AcoSource {
  locale: string;
}

export interface AcoConfig {
  viewId: string;
  priceBookId: string;
  source: AcoSource;
}

export interface GoogleConfig {
  merchantId: string;
  dataSourceId: string;
  feedLabel: string;
  contentLanguage: string;
  targetCountry: string;
}

export interface StoreConfig {
  urlTemplate: string;
}

export interface MarketConfig {
  id: string;
  aco: AcoConfig;
  google: GoogleConfig;
  store: StoreConfig;
}

export interface MarketsConfig {
  markets: MarketConfig[];
}

export interface FeedConfig {
  acoApiBaseUrl: string;
  acoViewId: string;
  acoPriceBookId: string;
  googleCredsJson: string;
  googleMerchantId: string;
  googleDataSourceId: string;
  googleFeedLabel: string;
  googleContentLanguage: string;
  googleTargetCountry: string;
  storeUrlTemplate: string;
}

/**
 * Attribute mapping configuration for Google Merchant Center.
 * Maps Google expected fields/values to custom Commerce attribute names/values.
 */
export interface AttributeMappingConfig {
  /** Maps Google field names to custom attribute names */
  fieldMappings: Record<string, string>;
  /** Maps Google expected values to custom values for enum fields */
  valueMappings: {
    condition: Record<string, string>;
    gender: Record<string, string>;
    ageGroup: Record<string, string>;
  };
}

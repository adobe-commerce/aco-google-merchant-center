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
 * Adobe Commerce client for fetching product data via GraphQL.
 *
 * @typedef {import('../types/commerce').CommerceProduct} CommerceProduct
 * @typedef {import('../types/commerce').CommerceSource} CommerceSource
 */

const PRODUCT_QUERY = `
  query GET_PRODUCT_DATA($skus: [String]) {
    products(skus: $skus) {
      __typename
      id
      sku
      name
      shortDescription
      metaDescription
      metaKeyword
      metaTitle
      description
      inStock
      addToCartAllowed
      url
      urlKey
      externalId
      images(roles: []) {
        url
        label
        roles
      }
      attributes(roles: []) {
        name
        label
        value
        roles
      }
      ... on SimpleProductView {
        price {
          roles
          regular {
            amount {
              value
              currency
            }
          }
          final {
            amount {
              value
              currency
            }
          }
        }
      }
      ... on ComplexProductView {
        priceRange {
          minimum {
            final {
              amount {
                value
                currency
              }
            }
            regular {
              amount {
                value
                currency
              }
            }
          }
          maximum {
            final {
              amount {
                value
                currency
              }
            }
            regular {
              amount {
                value
                currency
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetches products from Commerce by tenant ID and SKUs.
 *
 * @param {string} baseUrl - The base URL of the Commerce API
 * @param {string} viewId - The view ID
 * @param {string} priceBookId - The price book ID
 * @param {string} tenantId - The tenant/instance ID (environment ID)
 * @param {string[]} skus - Array of product SKUs
 * @param {CommerceSource} source - Source object containing locale info
 * @returns {Promise<CommerceProduct[]>} Array of product data objects
 */
const getProducts = async (
  baseUrl,
  viewId,
  priceBookId,
  tenantId,
  skus,
  source
) => {
  const url = `${baseUrl}/${tenantId}/graphql`;
  const locale = source?.locale;

  const headers = {
    "Content-Type": "application/json",
    "AC-Environment-Id": tenantId,
    "AC-Source-Locale": locale,
    "AC-View-Id": viewId,
    "AC-Price-Book-Id": priceBookId,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: PRODUCT_QUERY,
      variables: { skus },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Commerce Storefront API error: ${response.status} ${response.statusText}`
    );
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(
      `Commerce Storefront API error: ${JSON.stringify(result.errors)}`
    );
  }

  return result.data?.products || [];
};

module.exports = {
  getProducts,
};

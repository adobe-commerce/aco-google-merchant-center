/*
 * Copyright 2025 Adobe. All rights reserved.
  This file is licensed to you under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may obtain a copy
  of the License at http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software distributed under
  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
  OF ANY KIND, either express or implied. See the License for the specific language
  governing permissions and limitations under the License.
 */

jest.mock("@adobe/aio-sdk", () => ({
  Core: {
    Logger: jest.fn(),
  },
}));

jest.mock("./../clients/commerce.js", () => ({
  getProducts: jest.fn(),
}));

jest.mock("./../clients/google.js", () => ({
  insertProducts: jest.fn(),
  updateProducts: jest.fn(),
  deleteProducts: jest.fn(),
}));

jest.mock("./../transformers/product.js", () => ({
  transformProduct: jest.fn(),
}));

const { Core } = require("@adobe/aio-sdk");
const { getProducts } = require("./../clients/commerce.js");
const {
  insertProducts,
  updateProducts,
  deleteProducts,
} = require("./../clients/google.js");
const { transformProduct } = require("./../transformers/product.js");
const action = require("./../actions/catalog/index.js");

const mockLoggerInstance = {
  info: jest.fn(),
  error: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  Core.Logger.mockReturnValue(mockLoggerInstance);
});

const baseParams = {
  LOG_LEVEL: "info",
  ACO_API_BASE_URL: "https://api.example.com",
  ACO_PRICE_BOOK_ID: "price-book-123",
  ACO_VIEW_ID: "view-123",
  GOOGLE_MERCHANT_ID: "merchant-123",
  GOOGLE_DATA_SOURCE_ID: "datasource-123",
  GOOGLE_FEED_LABEL: "US",
  GOOGLE_CREDS_PATH: "/path/to/creds.json",
  STORE_URL_TEMPLATE: "https://store.example.com/products/{sku}",
  type: "com.adobe.commerce.storefront.events.product.aco",
  data: {
    instanceId: "tenant-123",
    items: [],
  },
};

describe("catalog action", () => {
  test("main should be defined", () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test("returns error when required env vars are missing", async () => {
    const params = {
      data: { instanceId: "test" },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(500);
    expect(result.body.error).toContain("missing parameter");
  });

  test("returns error when event data is missing", async () => {
    const params = {
      ...baseParams,
      type: undefined,
      data: { instanceId: "test" },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("missing parameter");
  });

  test("returns error for invalid event type", async () => {
    const params = {
      ...baseParams,
      type: "invalid.event.type",
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("Invalid event type");
  });

  test("processes create operations", async () => {
    const mockProduct = { sku: "test-sku", name: "Test Product" };
    const mockTransformed = { offerId: "test-sku" };

    getProducts.mockResolvedValue([mockProduct]);
    transformProduct.mockReturnValue(mockTransformed);
    insertProducts.mockResolvedValue([]);

    const params = {
      ...baseParams,
      data: {
        instanceId: "tenant-123",
        items: [
          {
            sku: "test-sku",
            operation: "create",
            sources: [{ locale: "en-US" }],
          },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(200);
    expect(getProducts).toHaveBeenCalled();
    expect(transformProduct).toHaveBeenCalled();
    expect(insertProducts).toHaveBeenCalled();
  });

  test("processes update operations", async () => {
    const mockProduct = { sku: "test-sku", name: "Test Product" };
    const mockTransformed = { offerId: "test-sku" };

    getProducts.mockResolvedValue([mockProduct]);
    transformProduct.mockReturnValue(mockTransformed);
    updateProducts.mockResolvedValue([]);

    const params = {
      ...baseParams,
      data: {
        instanceId: "tenant-123",
        items: [
          {
            sku: "test-sku",
            operation: "update",
            sources: [{ locale: "en-US" }],
          },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(200);
    expect(updateProducts).toHaveBeenCalled();
  });

  test("processes delete operations", async () => {
    deleteProducts.mockResolvedValue();

    const params = {
      ...baseParams,
      data: {
        instanceId: "tenant-123",
        items: [
          {
            sku: "test-sku",
            operation: "delete",
            sources: [{ locale: "en-US" }],
          },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(200);
    expect(deleteProducts).toHaveBeenCalled();
    expect(getProducts).not.toHaveBeenCalled();
  });

  test("returns error when Commerce API fails", async () => {
    getProducts.mockRejectedValue(new Error("Commerce API error"));

    const params = {
      ...baseParams,
      data: {
        instanceId: "tenant-123",
        items: [
          {
            sku: "test-sku",
            operation: "create",
            sources: [{ locale: "en-US" }],
          },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(500);
    expect(result.body.error).toContain("Commerce API error");
  });
});

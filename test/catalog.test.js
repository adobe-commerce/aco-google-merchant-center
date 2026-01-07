/*
 * Copyright 2026 Adobe. All rights reserved.
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

jest.mock("./../processors/aco/products.js", () => ({
  processProductEvent: jest.fn(),
}));

jest.mock("./../actions/config.js", () => ({
  loadMarketConfig: jest.fn(),
  buildLocaleIndex: jest.fn(),
}));

const { Core } = require("@adobe/aio-sdk");
const { processProductEvent } = require("./../processors/aco/products.js");
const { loadMarketConfig, buildLocaleIndex } = require("./../actions/config.js");
const action = require("./../actions/catalog/index.js");

const mockLoggerInstance = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

const mockMarketConfig = [
  {
    id: "us",
    aco: {
      viewId: "view-123",
      priceBookId: "price-book-123",
      source: { locale: "en-US" },
    },
    google: {
      merchantId: "merchant-123",
      dataSourceId: "datasource-123",
      feedLabel: "US",
      contentLanguage: "en",
      targetCountry: "US",
    },
    store: {
      urlTemplate: "https://store.example.com/products/{urlKey}",
    },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  Core.Logger.mockReturnValue(mockLoggerInstance);
  loadMarketConfig.mockReturnValue(mockMarketConfig);
  buildLocaleIndex.mockReturnValue(
    new Map([["en-us", mockMarketConfig]])
  );
});

const baseParams = {
  LOG_LEVEL: "info",
  ACO_API_BASE_URL: "https://api.example.com",
  ACO_TENANT_ID: "tenant-123",
  GOOGLE_CREDS_PATH: "/path/to/creds.json",
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
      type: "com.adobe.commerce.storefront.events.product.aco",
      data: { instanceId: "test", items: [] },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(500);
    expect(result.body.error).toContain("missing parameter");
  });

  test("returns error when tenant ID does not match", async () => {
    const params = {
      ...baseParams,
      data: {
        instanceId: "wrong-tenant",
        items: [{ sku: "test-sku", operation: "create", sources: [{ locale: "en-US" }] }],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("does not match expected tenant ID");
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
      data: {
        instanceId: "tenant-123",
        items: [
          { sku: "test-sku", operation: "create", sources: [{ locale: "en-US" }] },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("Invalid event type");
  });

  test("processes product events successfully", async () => {
    processProductEvent.mockResolvedValue();

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
    expect(processProductEvent).toHaveBeenCalledWith(
      "tenant-123",
      params.data.items,
      expect.objectContaining({
        acoApiBaseUrl: "https://api.example.com",
        acoViewId: "view-123",
        acoPriceBookId: "price-book-123",
        googleMerchantId: "merchant-123",
        googleDataSourceId: "datasource-123",
        googleFeedLabel: "US",
      }),
      expect.any(Object)
    );
  });

  test("returns success when no items match configured markets", async () => {
    buildLocaleIndex.mockReturnValue(new Map());

    const params = {
      ...baseParams,
      data: {
        instanceId: "tenant-123",
        items: [
          {
            sku: "test-sku",
            operation: "create",
            sources: [{ locale: "fr-FR" }],
          },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(200);
    expect(result.body.response).toContain("No event items matched");
    expect(processProductEvent).not.toHaveBeenCalled();
  });

  test("processes price events successfully", async () => {
    processProductEvent.mockResolvedValue();

    const params = {
      ...baseParams,
      type: "com.adobe.commerce.storefront.events.price.aco",
      data: {
        instanceId: "tenant-123",
        items: [
          {
            sku: "test-sku",
            operation: "update",
            sources: [{ locale: "en-US", priceBookId: "price-book-123" }],
          },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(200);
    expect(processProductEvent).toHaveBeenCalled();
  });

  test("skips price events that do not match market price book", async () => {
    processProductEvent.mockResolvedValue();

    const params = {
      ...baseParams,
      type: "com.adobe.commerce.storefront.events.price.aco",
      data: {
        instanceId: "tenant-123",
        items: [
          {
            sku: "test-sku",
            operation: "update",
            sources: [{ locale: "en-US", priceBookId: "different-price-book" }],
          },
        ],
      },
    };

    const result = await action.main(params);

    expect(result.statusCode).toBe(200);
    expect(processProductEvent).not.toHaveBeenCalled();
  });

  test("returns error when processProductEvent fails", async () => {
    processProductEvent.mockRejectedValue(new Error("Processing error"));

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
    expect(result.body.error).toContain("Processing error");
  });
});

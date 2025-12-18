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

const { errorResponse, successResponse } = require("./../actions/responses.js");
const { HTTP_OK } = require("./../actions/constants.js");

test("interface", () => {
  expect(typeof errorResponse).toBe("function");
  expect(typeof successResponse).toBe("function");
});

describe("errorResponse", () => {
  test("(400, errorMessage)", () => {
    const res = errorResponse(400, "errorMessage");
    expect(res).toEqual({
      statusCode: 400,
      body: { error: "errorMessage" },
    });
  });

  test("(500, internal error)", () => {
    const res = errorResponse(500, "internal error");
    expect(res).toEqual({
      statusCode: 500,
      body: { error: "internal error" },
    });
  });
});

describe("successResponse", () => {
  test("returns success response with type and message", () => {
    const res = successResponse(
      "com.adobe.commerce.storefront.events.product.aco",
      "Processed 3 items"
    );
    expect(res).toEqual({
      statusCode: HTTP_OK,
      body: {
        type: "com.adobe.commerce.storefront.events.product.aco",
        response: "Processed 3 items",
      },
    });
  });
});

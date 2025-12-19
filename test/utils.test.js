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

const utils = require("./../actions/utils.js");

test("interface", () => {
  expect(typeof utils.stringParameters).toBe("function");
  expect(typeof utils.checkMissingRequestInputs).toBe("function");
  expect(typeof utils.getBearerToken).toBe("function");
  expect(typeof utils.chunk).toBe("function");
  expect(typeof utils.groupByOperation).toBe("function");
});

describe("stringParameters", () => {
  test("no auth header", () => {
    const params = {
      a: 1,
      b: 2,
      __ow_headers: { "x-api-key": "fake-api-key" },
    };
    expect(utils.stringParameters(params)).toEqual(JSON.stringify(params));
  });

  test("with auth header", () => {
    const params = {
      a: 1,
      b: 2,
      __ow_headers: { "x-api-key": "fake-api-key", authorization: "secret" },
    };
    expect(utils.stringParameters(params)).toEqual(
      expect.stringContaining('"authorization":"<hidden>"')
    );
    expect(utils.stringParameters(params)).not.toEqual(
      expect.stringContaining("secret")
    );
  });
});

describe("checkMissingRequestInputs", () => {
  test("({ a: 1, b: 2 }, [a])", () => {
    expect(utils.checkMissingRequestInputs({ a: 1, b: 2 }, ["a"])).toEqual(
      null
    );
  });

  test("({ a: 1 }, [a, b])", () => {
    expect(utils.checkMissingRequestInputs({ a: 1 }, ["a", "b"])).toEqual(
      "missing parameter(s) 'b'"
    );
  });

  test("({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h.i])", () => {
    expect(
      utils.checkMissingRequestInputs({ a: { b: { c: 1 } }, f: { g: 2 } }, [
        "a.b.c",
        "f.g.h.i",
      ])
    ).toEqual("missing parameter(s) 'f.g.h.i'");
  });

  test("({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h])", () => {
    expect(
      utils.checkMissingRequestInputs({ a: { b: { c: 1 } }, f: { g: 2 } }, [
        "a.b.c",
        "f",
      ])
    ).toEqual(null);
  });

  test("({ a: 1, __ow_headers: { h: 1, i: 2 } }, undefined, [h])", () => {
    expect(
      utils.checkMissingRequestInputs(
        { a: 1, __ow_headers: { h: 1, i: 2 } },
        undefined,
        ["h"]
      )
    ).toEqual(null);
  });

  test("({ a: 1, __ow_headers: { f: 2 } }, [a], [h, i])", () => {
    expect(
      utils.checkMissingRequestInputs(
        { a: 1, __ow_headers: { f: 2 } },
        ["a"],
        ["h", "i"]
      )
    ).toEqual("missing header(s) 'h,i'");
  });

  test("({ c: 1, __ow_headers: { f: 2 } }, [a, b], [h, i])", () => {
    expect(
      utils.checkMissingRequestInputs({ c: 1 }, ["a", "b"], ["h", "i"])
    ).toEqual("missing header(s) 'h,i' and missing parameter(s) 'a,b'");
  });

  test("({ a: 0 }, [a])", () => {
    expect(utils.checkMissingRequestInputs({ a: 0 }, ["a"])).toEqual(null);
  });

  test("({ a: null }, [a])", () => {
    expect(utils.checkMissingRequestInputs({ a: null }, ["a"])).toEqual(null);
  });

  test("({ a: '' }, [a])", () => {
    expect(utils.checkMissingRequestInputs({ a: "" }, ["a"])).toEqual(
      "missing parameter(s) 'a'"
    );
  });

  test("({ a: undefined }, [a])", () => {
    expect(utils.checkMissingRequestInputs({ a: undefined }, ["a"])).toEqual(
      "missing parameter(s) 'a'"
    );
  });
});

describe("getBearerToken", () => {
  test("({})", () => {
    expect(utils.getBearerToken({})).toEqual(undefined);
  });

  test("({ authorization: Bearer fake, __ow_headers: {} })", () => {
    expect(
      utils.getBearerToken({ authorization: "Bearer fake", __ow_headers: {} })
    ).toEqual(undefined);
  });

  test("({ authorization: Bearer fake, __ow_headers: { authorization: fake } })", () => {
    expect(
      utils.getBearerToken({
        authorization: "Bearer fake",
        __ow_headers: { authorization: "fake" },
      })
    ).toEqual(undefined);
  });

  test("({ __ow_headers: { authorization: Bearerfake} })", () => {
    expect(
      utils.getBearerToken({ __ow_headers: { authorization: "Bearerfake" } })
    ).toEqual(undefined);
  });

  test("({ __ow_headers: { authorization: Bearer fake} })", () => {
    expect(
      utils.getBearerToken({ __ow_headers: { authorization: "Bearer fake" } })
    ).toEqual("fake");
  });

  test("({ __ow_headers: { authorization: Bearer fake Bearer fake} })", () => {
    expect(
      utils.getBearerToken({
        __ow_headers: { authorization: "Bearer fake Bearer fake" },
      })
    ).toEqual("fake Bearer fake");
  });
});

describe("chunk", () => {
  test("splits array into chunks of specified size", () => {
    expect(utils.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("handles array smaller than chunk size", () => {
    expect(utils.chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  test("handles empty array", () => {
    expect(utils.chunk([], 5)).toEqual([]);
  });

  test("handles chunk size of 1", () => {
    expect(utils.chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

describe("groupByOperation", () => {
  test("groups items by operation type", () => {
    const items = [
      { sku: "a", operation: "create" },
      { sku: "b", operation: "update" },
      { sku: "c", operation: "delete" },
      { sku: "d", operation: "create" },
    ];
    expect(utils.groupByOperation(items)).toEqual({
      create: [
        { sku: "a", operation: "create" },
        { sku: "d", operation: "create" },
      ],
      update: [{ sku: "b", operation: "update" }],
      delete: [{ sku: "c", operation: "delete" }],
    });
  });

  test("handles empty array", () => {
    expect(utils.groupByOperation([])).toEqual({
      create: [],
      update: [],
      delete: [],
    });
  });

  test("ignores unknown operations", () => {
    const items = [{ sku: "a", operation: "unknown" }];
    expect(utils.groupByOperation(items)).toEqual({
      create: [],
      update: [],
      delete: [],
    });
  });
});

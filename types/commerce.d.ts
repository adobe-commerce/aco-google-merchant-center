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
 * Adobe Commerce Product Types from Storefront GraphQL API
 */

export interface CommercePriceAmount {
  value: number;
  currency: string;
}

export interface CommercePrice {
  roles: string[];
  regular: {
    amount: CommercePriceAmount;
  };
  final: {
    amount: CommercePriceAmount;
  };
}

export interface CommercePriceRange {
  minimum: {
    final: { amount: CommercePriceAmount };
    regular: { amount: CommercePriceAmount };
  };
  maximum: {
    final: { amount: CommercePriceAmount };
    regular: { amount: CommercePriceAmount };
  };
}

export interface CommerceImage {
  url: string;
  label: string;
  roles: string[];
}

export interface CommerceAttribute {
  name: string;
  label: string;
  value: string;
  roles: string[];
}

export interface CommerceSource {
  locale: string;
}

export interface CommerceProductBase {
  __typename: "SimpleProductView" | "ComplexProductView";
  id: string;
  sku: string;
  name: string;
  shortDescription: string;
  metaDescription: string;
  metaKeyword: string;
  metaTitle: string;
  description: string;
  inStock: boolean;
  addToCartAllowed: boolean;
  url: string;
  urlKey: string;
  externalId: string;
  images: CommerceImage[];
  attributes: CommerceAttribute[];
}

export interface CommerceSimpleProduct extends CommerceProductBase {
  __typename: "SimpleProductView";
  price: CommercePrice;
}

export interface CommerceOptionValue {
  id: string;
  title: string;
  inStock: boolean;
}

export interface CommerceOption {
  id: string;
  title: string;
  required: boolean;
  multi: boolean;
  values: CommerceOptionValue[];
}

export interface CommerceComplexProduct extends CommerceProductBase {
  __typename: "ComplexProductView";
  priceRange: CommercePriceRange;
  options?: CommerceOption[];
}

export type CommerceProduct = CommerceSimpleProduct | CommerceComplexProduct;

/**
 * Variant returned by the variants query
 */
export interface CommerceVariant {
  /** Array of selected option IDs (e.g., ["condition-NEW"]) */
  selections: string[];
  /** The variant's product data */
  product: CommerceSimpleProduct;
}

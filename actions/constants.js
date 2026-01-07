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

// Define standard HTTP status codes used for API responses
const HTTP_OK = 200; // Request was successful
const HTTP_BAD_REQUEST = 400; // Client-side error: invalid request parameters
const HTTP_NOT_FOUND = 404; // Resource not found on the server
const HTTP_INTERNAL_ERROR = 500; // Server-side error: unexpected failure

// ACO Event Types
const ACO_EVENT_TYPE_PRODUCT =
  "com.adobe.commerce.storefront.events.product.aco";
const ACO_EVENT_TYPE_PRICE = "com.adobe.commerce.storefront.events.price.aco";

// Export the constants so they can be reused in other modules/files
module.exports = {
  HTTP_OK,
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  HTTP_INTERNAL_ERROR,
  ACO_EVENT_TYPE_PRODUCT,
  ACO_EVENT_TYPE_PRICE,
};

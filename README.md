# ACO -> Google Merchant Center

> [!IMPORTANT]
> Customization is needed to correctly map fields from Commerce Optimizer to the Google Product Input.
> See the Customization section below.

## Supported Catalog Events

- Commerce Optimizer Product Update: `com.adobe.commerce.storefront.events.product.aco`
- Commerce Optimizer Price Update: `com.adobe.commerce.storefront.events.price.aco`

## Customization

Some fields required by Google Merchant Center are not readily available in Commerce Optimizer. This application provides a product transformer `transformers/product.js` which contains functions to perform mapping from a Commerce Optimizer product to the Google Product Input format, but will likely require customizations to retrieve and construct these values correctly.

The following functions need to be customized:

- `getProductUrl`: A basic function is provided to use the `sku` field from the Commerce Optimizer product and map to the template provided in the `store.urlTemplate` market configuration variable (ie. `https://mystore.com/products/{sku}`). Customize this function to correctly construct your canonical product URLs so Google can correctly index your PDPs.
- `transformPrice`: A basic function is provided to retrieve the price returned from the Commerce Optimizer API. Customize this function if you have custom price functionality on top of the price returned by Commerce Optimizer.
- `getAvailability`: A basic function is provided to map the `inStock` attribute of the Commerce Optimizer product to the Google Product Availability enum. Customize this function to correctly pull product availability from your inventory management system.
- `getShippingInfo`: A basic function is provided to map `shippingMethod`, `shippingPrice` and `shippingCurrency` (if present as customer attributes) from the Commerce Optimizer product to the Google Product Input's required `shipping` field. Customize this function to pull shipping information as required.

## App Builder

This application runs on top of [App Builder](https://developer.adobe.com/app-builder/docs/intro_and_overview/).

Also see
[App Builder Architecture](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/architecture_overview/architecture-overview).

### Getting Started with App Builder

See
[App Builder Getting Started](https://developer.adobe.com/app-builder/docs/get_started/app_builder_get_started/app-builder-intro)
documentation.

## Installation

Follow the steps below to install and configure the Google Merchant Center synchronization application.

### Prerequisites

#### Install the AIO CLI

Run the following command to install the [AIO CLI](https://developer.adobe.com/runtime/docs/guides/tools/cli_install/).

```sh
npm install -g @adobe/aio-cli
```

#### Clone the Required Repositories

1. Clone this repository: `git clone git@github.com:adobe-commerce/aco-google-merchant-center.git`.

#### Create App Builder Project

1. Log in to the [Developer Console](https://developer.adobe.com/console).
   1. Click on **Create project from template**.
   2. Select **App Builder**.
   3. Give your project a name and a title.
   4. Click **Save**.
2. Select the **Stage** workspace.
3. Add the required API services to your new App Builder project.
   1. Click the **Add service** button.
   2. In the dropdown, select **API**.
   3. Select the **I/O Events** card.
   4. Click **Next**.
   5. Click **Next**.
   6. Select the checkbox next to the **Default - Cloud Manager** profile.
   7. Click **Save configured API**
   8. Repeat the above steps for the following APIs to add them to your credential:
      1. I/O Management API
4. Subscribe to the Commerce Catalog Events
   1. Click the **Add service** button.
   2. In the dropdown, select **Event**.
   3. Select the **Commerce Catalog Events** card.
   4. Click **Next**.
   5. Select the **Instance ID** you wish to subscribe to. This will be your Commerce Tenant ID.
   6. Click **Next**.
   7. Choose which events to subscribe to. Select **Product Update** and **Price Update**.
   8. Click **Next**.
   9. Select the OAuth Server-to-Server credential to add this event registration to.
   10. Click **Next**.
   11. Give the event registration a name.
   12. Click **Next**.
   13. Click **Save configured events**.
5. Click the **Download all** button in the top right of the Developer Console to download the **Workspace JSON file**
   and save it locally (do not commit to source control). This file will be used to configure
   the Adobe authorization environment variables via the `aio app use --merge` CLI command.

### Deploy and Onboard the App Builder Application

1. Copy the `env.example` to a new `.env` file.
2. Run the following commands to connect your starter kit with the App Builder project configured above.

   ```sh
   aio login
   aio console org select
   # Search for and select the organization that your Developer Console project belongs to.
   aio console project select
   # Search for and select the Developer Console project created above.
   aio console workspace select
   # Search for and select the desired workspace (ie. Stage).
   aio app use --merge
   # Confirm the highlighted project matches the one configured above.
   # This command will update your .env file with AIO related environment variables.
   ```

#### Configure the .env file

1. Google Merchant Center credentials
   1. **GOOGLE_CREDS_PATH**: The path where your Google API credentials file is stored (ie. `/Users/app/aco-google-merchant-center/google-creds.json`).
2. Commerce Optimizer configuration
   1. **ACO_API_BASE_URL**: The base URL of the Commerce Optimizer API (ie. `https://na1-sandbox.api.commerce.adobe.com`).
   2. **ACO_TENANT_ID**: The Commerce Optimizer tenant identifier to synchronize with Google Product Feed.

#### Configure Target Markets

Complete the required configuration for mapping Commerce data to Google country/language markets by following the instructions in the [./config/markets/README.md](./config/markets/README.md) documentation.

#### Configure Attribute Mapping

Complete the required configuration for mapping Commerce custom attributes to Google required fields by following the instructions in the [./config/attributeMapping/README.md](./config/attributeMapping/README.md) documentation.

#### Install Dependencies

Run the following command:

```sh
npm install
```

#### Deploy the Application

Run the following command to deploy your app to your Developer Console project:

```sh
aio app deploy
```

> [!TIP]
> Run the `aio app deploy` command with `--force-build --force-deploy` flags to force a clean build.

## Logging

See the following App Builder documentation for more info:

- [Logging and Monitoring](https://developer.adobe.com/app-builder/docs/guides/runtime_guides/logging-monitoring)
- [Logging and Troubleshooting](https://developer.adobe.com/commerce/extensibility/app-development/best-practices/logging-troubleshooting)

### Tail All Action Logs

```sh
aio rt logs --tail
```

### List Activation Logs

List all runtime actions that have been activated.

```sh
aio rt activation list
```

### View Activation Log by ID

View the logs for a specific `activation_id`.

```sh
aio rt logs ${activation_id}
```

## Local Dev

To run your actions locally use the `aio app dev` option. The app will run on `localhost:9080` by default.

For more information about the local development, see [here](https://developer.adobe.com/app-builder/docs/guides/development).

### Send a test event

After starting the local server, you can send a test event via `curl` or any other HTTP client. Event payload examples can be found in the [example_event_payloads](./example_event_payloads/) directory.

For more information about testing this application with mock events, see the [README](./example_event_payloads/README.md) inside the `example_event_payloads` directory.

### Authorization

If `require-adobe-auth` is `true` in [app.config.yaml](../app.config.yaml), an `Authorization` header with your Dev Console project's access token will need to be provided in the test event call.

An access token can be generated in your [Developer Console](https://developer.adobe.com/console) in the Project's **Credentials** section.

![Dev Console Creds](../docs/dev_console_creds.png)

### Example

```sh
curl -k -X POST https://localhost:9080/api/v1/web/aco-google-merchant-center/catalog \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {ims_access_token}" \
  -d '{
    "specversion": "1.0",
    "type": "com.adobe.commerce.storefront.events.product.ccdm",
    "source": "urn:uuid:fb58963f-d2e7-4ab4-83da-b6ff15b8ebc0",
    "id": "23f76cef-9f14-44b1-bbd0-29995789c98e",
    "time": "2025-12-17T12:00:00.000Z",
    "datacontenttype": "application/json",
    "data": {
      "instanceId": "XdAHsRLZSusTtmCu3Kzobk",
      "items": [
        {
          "sku": "bol-mam-tir-prm-2014",
          "operation": "create",
          "sources": [{ "locale": "en-US" }]
        }
      ]
    }
  }'
```

You should see a response like the example below. Logs will be output to the console.

```sh
{
  "type": "com.adobe.commerce.storefront.events.product.ccdm",
  "response": "Processed 1 item(s) across 1 market(s) for tenant: XdAHsRLZSusTtmCu3Kzobk"
}
```

## Test & Coverage

- Run `aio app test` to run unit tests for ui and actions.
- Run `aio app test --e2e` to run e2e tests.

## Deploy & Cleanup

- `aio app deploy` to build and deploy all actions on Runtime and static files to CDN.
- `aio app undeploy` to undeploy the app.

## Action Configuration

### `app.config.yaml`

- Main configuration file that defines an application's implementation.
- More information on this file, application configuration, and extension configuration
  can be found [here](https://developer.adobe.com/app-builder/docs/guides/configuration/#appconfigyaml)

#### Action Dependencies

- You have two options to resolve your actions' dependencies:

  1. **Packaged action file**: Add your action's dependencies to the root
     `package.json` and install them using `npm install`. Then set the `function`
     field in `app.config.yaml` to point to the **entry file** of your action
     folder. We will use `webpack` to package your code and dependencies into a
     single minified js file. The action will then be deployed as a single file.
     Use this method if you want to reduce the size of your actions.

  2. **Zipped action folder**: In the folder containing the action code add a
     `package.json` with the action's dependencies. Then set the `function`
     field in `app.config.yaml` to point to the **folder** of that action. We will
     install the required dependencies within that directory and zip the folder
     before deploying it as a zipped action. Use this method if you want to keep
     your action's dependencies separated.

## Debugging in VS Code

While running your local server (`aio app dev`), both UI and actions can be debugged. To do so follow the instructions [here](https://developer.adobe.com/app-builder/docs/guides/development/#debugging)

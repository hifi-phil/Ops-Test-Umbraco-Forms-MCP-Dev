// Loads .env, so the transformer below can ask the connected Umbraco which
// version it is (it needs UMBRACO_BASE_URL / UMBRACO_CLIENT_ID /
// UMBRACO_CLIENT_SECRET, which live there rather than in the shell).
import "./src/load-env.js";

import { defineConfig, type HookFunction } from "orval";
import {
  orvalImportFixer,
  relaxUntypedArrays,
  postProcessZodFiles,
  createUmbracoTargetMajorTransformer,
} from "@umbraco-cms/mcp-server-sdk/orval";
import { relaxMidLineFields } from "./src/umbraco-api/api/relax-mid-line-fields.js";

/**
 * Stamps the Umbraco major version this server targets into a generated
 * constant.
 *
 * The value comes from one place: an authenticated
 * `GET /umbraco/management/api/v1/server/information` against the instance in
 * `.env`. It cannot come from the spec — every Umbraco spec hard-codes
 * `info.version` to the literal string `"Latest"` — and there is deliberately
 * no option, env var or fallback for asserting it by hand, because a value
 * nothing reported is a value nobody revisits (Umbraco-MCP-Base#220).
 *
 * So `npm run generate` needs `UMBRACO_BASE_URL`, `UMBRACO_CLIENT_ID` and
 * `UMBRACO_CLIENT_SECRET` — the same three the server itself runs on, which
 * `init`/`discover` sets up. Without them it fails rather than guessing.
 *
 * It sits in orval's input-transformer slot not because it needs the spec (it
 * ignores it) but because that slot runs as part of the same invocation that
 * generates the client — so the constant and the tools cannot drift apart. A
 * separate step could be skipped; this cannot.
 *
 * The committed `umbraco-target.generated.ts` is a *placeholder* so a fresh
 * scaffold compiles before anyone has generated anything. It says so in its own
 * doc comment. Your first `npm run generate` replaces it with a real value.
 */
const stampTargetMajor = createUmbracoTargetMajorTransformer({
  outputPath: "./src/config/umbraco-target.generated.ts",
});

/**
 * Orval Configuration
 *
 * This generates TypeScript API clients from OpenAPI specs.
 *
 * This is the v17 line (branches v17/main, v17/dev), generated against Umbraco
 * 17 + Umbraco Forms 17.x. Umbraco 17 serves its specs through Swashbuckle at
 * /umbraco/swagger/<document>/swagger.json (OpenAPI 3.0); Umbraco 18 (the
 * main/dev branches) serves /umbraco/openapi/<document>.json (OpenAPI 3.1).
 *
 * The Management API spec is read from the same instance as the target major
 * (UMBRACO_BASE_URL in .env, defaulting to the demo-site's
 * https://localhost:44390), so the generated client and the stamped
 * UMBRACO_TARGET_MAJOR cannot come from two different Umbraco installs.
 *
 * This config uses orval 8 with workarounds for a few Umbraco-specific quirks
 * (see relax-untyped-arrays.ts and zod-post-process.ts); they apply to the
 * OpenAPI 3.0 and 3.1 documents alike.
 */
const FORMS_MANAGEMENT_SPEC_URL = `${(process.env.UMBRACO_BASE_URL ?? "https://localhost:44390").replace(/\/+$/, "")}/umbraco/swagger/forms-management/swagger.json`;

export default defineConfig({
  // Main API client generation
  umbracoFormsManagementApi: {
    input: {
      target: FORMS_MANAGEMENT_SPEC_URL,
      unsafeDisableValidation: true,
      override: {
        // Transformers compose. `relaxMidLineFields` makes optional the
        // properties older Forms releases on this major don't send (see
        // src/umbraco-api/api/relax-mid-line-fields.ts). `stampTargetMajor`
        // leaves the spec untouched — it only writes src/config/umbraco-target.generated.ts as a side
        // effect of running at generation time. It is async (it may call the
        // instance); orval awaits input transformers, so returning the promise
        // is correct.
        transformer: (spec) => stampTargetMajor(relaxMidLineFields(relaxUntypedArrays(spec))),
      },
    },
    output: {
      target: "./src/umbraco-api/api/generated/umbracoFormsManagementApi.ts",
      client: "axios",
      mode: "single",
      clean: false,
      override: {
        mutator: {
          path: "./src/umbraco-api/api/client.ts",
          name: "customInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: orvalImportFixer as HookFunction,
    },
  },

  // Zod schema generation for validation
  umbracoFormsManagementApiZod: {
    input: {
      target: FORMS_MANAGEMENT_SPEC_URL,
      unsafeDisableValidation: true,
      override: {
        transformer: (spec) => relaxMidLineFields(relaxUntypedArrays(spec)),
      },
    },
    output: {
      target: "./src/umbraco-api/api/generated/umbracoFormsManagementApi.zod.ts",
      client: "zod",
      mode: "single",
      clean: false,
      override: {
        zod: {
          dateTimeOptions: {
            local: true,
            offset: true,
          },
          coerce: {
            query: ["number", "boolean"],
          },
        },
      },
    },
    hooks: {
      // Keep the generated zod surface stable across the orval 7 -> 8 upgrade.
      afterAllFilesWrite: postProcessZodFiles as HookFunction,
    },
  },

  // Forms Delivery API client generation.
  //
  // Unlike the Management API, the Delivery API spec is checked in rather
  // than fetched live. It's a small, stable public surface (get a form
  // definition, submit an entry). Umbraco 17 does serve one, at
  // /umbraco/swagger/forms-delivery/swagger.json, but each release's own
  // spec marks its newest FormDto fields required — 17.5's requires the
  // multi-page paging/summary flags Forms 17.0 doesn't send — while the
  // checked-in copy validates against every 17.x. It also authenticates
  // differently (an `Api-Key` header, not OAuth), hence the separate
  // `deliveryInstance` mutator in `./src/umbraco-api/api/delivery-client.ts`.
  umbracoFormsDeliveryApi: {
    input: {
      target: "./src/umbraco-api/api/forms-delivery-swagger.json",
      unsafeDisableValidation: true,
    },
    output: {
      target: "./src/umbraco-api/api/generated/umbracoFormsDeliveryApi.ts",
      client: "axios",
      mode: "single",
      clean: false,
      override: {
        mutator: {
          path: "./src/umbraco-api/api/delivery-client.ts",
          name: "deliveryInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: orvalImportFixer as HookFunction,
    },
  },

  umbracoFormsDeliveryApiZod: {
    input: {
      target: "./src/umbraco-api/api/forms-delivery-swagger.json",
      unsafeDisableValidation: true,
    },
    output: {
      target: "./src/umbraco-api/api/generated/umbracoFormsDeliveryApi.zod.ts",
      client: "zod",
      mode: "single",
      clean: false,
      override: {
        zod: {
          dateTimeOptions: {
            local: true,
            offset: true,
          },
          coerce: {
            query: ["number", "boolean"],
          },
        },
      },
    },
    hooks: {
      afterAllFilesWrite: postProcessZodFiles as HookFunction,
    },
  },
});

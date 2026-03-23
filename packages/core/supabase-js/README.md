<br />
<p align="center">
  <a href="https://supabase.io">
        <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/supabase-logo-wordmark--dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/supabase-logo-wordmark--light.svg">
      <img alt="Supabase Logo" width="300" src="https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/logo-preview.jpg">
    </picture>
  </a>

  <h1 align="center">Supabase JS SDK</h1>

  <h3 align="center">Isomorphic JavaScript SDK for Supabase - combining Auth, Database, Storage, Functions, and Realtime.</h3>

  <p align="center">
    <a href="https://supabase.com/docs/guides/getting-started">Guides</a>
    ·
    <a href="https://supabase.com/docs/reference/javascript/start">Reference Docs</a>
    ·
    <a href="https://supabase.github.io/supabase-js/supabase-js/v2/spec.json">TypeDoc</a>
  </p>
</p>

<div align="center">

[![Build](https://github.com/supabase/supabase-js/workflows/CI/badge.svg)](https://github.com/supabase/supabase-js/actions?query=branch%3Amaster)
[![Package](https://img.shields.io/npm/v/@supabase/supabase-js)](https://www.npmjs.com/package/@supabase/supabase-js)
[![License: MIT](https://img.shields.io/npm/l/@supabase/supabase-js)](#license)
[![pkg.pr.new](https://pkg.pr.new/badge/supabase/supabase-js)](https://pkg.pr.new/~/supabase/supabase-js)

</div>

## Usage

First of all, you need to install the library:

```sh
npm install @supabase/supabase-js
```

Then you're able to import the library and establish the connection with the database:

```js
import { createClient } from '@supabase/supabase-js'

// Create a single supabase client for interacting with your database
const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
```

### Secure integration (app clients)

Use `createSecureClient` in web/mobile app code that calls your edge proxies (`db-proxy`, `auth-proxy`):

```ts
import { createSecureClient } from '@supabase/supabase-js'

const secure = createSecureClient(
  'https://xyzcompany.supabase.co',
  'public-anon-key',
  {},
  {
    edge: {
      initialPublicKeyB64: process.env.NEXT_PUBLIC_E2EE_PUBLIC_KEY_B64,
      allowPlainFallback: false,
      // defaults:
      // dbProxyFunctionName: 'db-proxy'
      // authProxyFunctionName: 'auth-proxy'
    },
  }
)

const { data, error } = await secure.db
  .from('profiles')
  .select<{ id: string; email: string }>()
  .eq('id', '...')
  .maybeSingle()

if (error) throw error
```

### Edge Functions usage (Deno)

Inside edge handlers, use `createClient` from this same package for direct DB access:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

// Admin client (service role)
const admin = createClient(supabaseUrl, serviceRoleKey)

// User-scoped client (RLS applies)
const userClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  auth: { persistSession: false, autoRefreshToken: false },
})
```

Notes:

- Deno is supported.
- Keep private key only in edge secrets (`E2EE_RSA_PRIVATE_KEY_B64`).
- `createSecureClient` is primarily for app/client-side proxy calls, not for DB access inside edge functions.

Available classes/exports:

- `SecureEdgeInvoker`
- `SecureDbProxyClient`
- `SecureAuthProxyClient`
- `SecureSupabaseClient`
- `createSecureSupabaseClient`
- `createSecureClient`

### Sync into `supabase/functions/_shared` (local integration)

To make edge integration easy in any project, this package includes a CLI command that vendors your built SDK into a Supabase functions folder and writes a bridge file.

Install globally once from your local fork/package path:

```bash
npm install -g "/absolute/path/to/securesupabase-js/packages/core/supabase-js"
```

If you publish your fork, replace with your own package name (example):

```bash
npm install -g @your-scope/securesupabase-js
```

Then from an app project root run:

```bash
securesupabase init
```

or:

```bash
securesupabase init --project-dir "/absolute/path/to/your-app"
```

or:

```bash
securesupabase init --functions-dir "/absolute/path/to/your-app/supabase/functions"
```

From `packages/core/supabase-js`:

```bash
npm run build
npm run sync:edge-functions -- --functions-dir "/absolute/path/to/your-app/supabase/functions"
```

What it writes:

- `supabase/functions/_shared/vendor/securesupabase/index.mjs`
- `supabase/functions/_shared/securesupabase.ts`

Then in your edge handlers use:

```ts
import { createClient } from '../_shared/securesupabase.ts'
```

### UMD

You can use plain `<script>`s to import supabase-js from CDNs, like:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

or even:

```html
<script src="https://unpkg.com/@supabase/supabase-js@2"></script>
```

Then you can use it from a global `supabase` variable:

```html
<script>
  const { createClient } = supabase
  const _supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')

  console.log('Supabase Instance: ', _supabase)
  // ...
</script>
```

### ESM

You can use `<script type="module">` to import supabase-js from CDNs, like:

```html
<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
  const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')

  console.log('Supabase Instance: ', supabase)
  // ...
</script>
```

### Deno

You can use supabase-js in the Deno runtime via [JSR](https://jsr.io/@supabase/supabase-js):

```js
import { createClient } from 'jsr:@supabase/supabase-js@2'
```

### Custom `fetch` implementation

`supabase-js` uses the [`cross-fetch`](https://www.npmjs.com/package/cross-fetch) library to make HTTP requests, but an alternative `fetch` implementation can be provided as an option. This is most useful in environments where `cross-fetch` is not compatible, for instance Cloudflare Workers:

```js
import { createClient } from '@supabase/supabase-js'

// Provide a custom `fetch` implementation as an option
const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key', {
  global: {
    fetch: (...args) => fetch(...args),
  },
})
```

## Support Policy

This section outlines the scope of support for various runtime environments in Supabase JavaScript client.

### Node.js

We only support Node.js versions that are in **Active LTS** or **Maintenance** status as defined by the [official Node.js release schedule](https://nodejs.org/en/about/previous-releases#release-schedule). This means we support versions that are currently receiving long-term support and critical bug fixes.

When a Node.js version reaches end-of-life and is no longer in Active LTS or Maintenance status, Supabase will drop it in a **minor release**, and **this won't be considered a breaking change**.

> ⚠️ **Node.js 18 Deprecation Notice**
>
> Node.js 18 reached end-of-life on April 30, 2025. As announced in [our deprecation notice](https://github.com/orgs/supabase/discussions/37217), support for Node.js 18 was dropped in version `2.79.0`.
>
> If you must use Node.js 18, please use version `2.78.0`, which is the last version that supported Node.js 18.

### Deno

We support Deno versions that are currently receiving active development and security updates. We follow the [official Deno release schedule](https://docs.deno.com/runtime/fundamentals/stability_and_releases/) and only support versions from the `stable` and `lts` release channels.

When a Deno version reaches end-of-life and is no longer receiving security updates, Supabase will drop it in a **minor release**, and **this won't be considered a breaking change**.

### Browsers

All modern browsers are supported. We support browsers that provide native `fetch` API. For Realtime features, browsers must also support native `WebSocket` API.

### Bun

We support Bun runtime environments. Bun provides native fetch support and is compatible with Node.js APIs. Since Bun does not follow a structured release schedule like Node.js or Deno, we support current stable versions of Bun and may drop support for older versions in minor releases without considering it a breaking change.

### React Native

We support React Native environments with fetch polyfills provided by the framework. Since React Native does not follow a structured release schedule, we support current stable versions and may drop support for older versions in minor releases without considering it a breaking change.

### Cloudflare Workers

We support Cloudflare Workers runtime environments. Cloudflare Workers provides native fetch support. Since Cloudflare Workers does not follow a structured release schedule, we support current stable versions and may drop support for older versions in minor releases without considering it a breaking change.

### Important Notes

- **Experimental features**: Features marked as experimental may be removed or changed without notice

## Known Build Warnings

### `UNUSED_EXTERNAL_IMPORT` in Vite / Rollup / Nuxt

When bundling your app, you may see warnings like:

```
"PostgrestError" is imported from external module "@supabase/postgrest-js" but never used in "...supabase-js/dist/index.mjs".
"FunctionRegion", "FunctionsError", "FunctionsFetchError", "FunctionsHttpError" and "FunctionsRelayError" are imported from external module "@supabase/functions-js" but never used in "...".
```

**This is a false positive — your bundle is fine.** Here is why it happens:

`@supabase/supabase-js` re-exports `PostgrestError`, `FunctionsError`, and related symbols so you can import them directly from `@supabase/supabase-js`. However, our build tool merges all imports from the same package into a single import statement in the built output:

```js
// dist/index.mjs (simplified)
import { PostgrestClient, PostgrestError } from '@supabase/postgrest-js'
//       ^ used internally    ^ re-exported for you
```

Your bundler checks which names from that import are used _in the code body_, and flags `PostgrestError` as unused because it only appears in an `export` statement — not called or assigned. The export itself is the usage, but downstream bundlers don't track this correctly. This is a known Rollup/Vite limitation with re-exported external imports.

**Nothing is broken.** Tree-shaking and bundle size are unaffected.

To suppress the warning:

**Vite / Rollup (`vite.config.js` or `rollup.config.js`):**

```js
export default {
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT' && warning.exporter?.includes('@supabase/'))
          return
        warn(warning)
      },
    },
  },
}
```

**Nuxt (`nuxt.config.ts`):**

```ts
export default defineNuxtConfig({
  vite: {
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'UNUSED_EXTERNAL_IMPORT' && warning.exporter?.includes('@supabase/'))
            return
          warn(warning)
        },
      },
    },
  },
})
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../../CONTRIBUTING.md) for details on how to get started.

For major changes or if you're unsure about something, please open an issue first to discuss your proposed changes.

### Building

```bash
# From the monorepo root
npx nx build supabase-js

# Or with watch mode for development
npx nx build supabase-js --watch
```

### Testing

There's a complete guide on how to set up your environment for running locally the `supabase-js` integration tests. Please refer to [TESTING.md](./TESTING.md).

## Badges

[![Coverage Status](https://coveralls.io/repos/github/supabase/supabase-js/badge.svg?branch=master)](https://coveralls.io/github/supabase/supabase-js?branch=master)

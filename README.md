# securesupabase-js

**Canonical repository:** https://github.com/brandmathco/securesupabase-js

This repository is **[BrandMatchCo](https://github.com/brandmathco)**’s extended fork of the official **[Supabase JavaScript client](https://github.com/supabase/supabase-js)**. It keeps the full upstream monorepo (Auth, PostgREST, Realtime, Storage, Functions) and adds **secure-by-default patterns** for apps that route sensitive database and auth traffic through **Edge Function proxies** instead of calling PostgREST or GoTrue directly from the client.

Upstream remains the source of truth for general SDK behavior, versioning, and runtime support; use this README for **what this fork adds** and how to use it.

## Fork, attribution, and disclaimer

- **Upstream project:** This repository is a **fork and derivative** of the open-source **[supabase/supabase-js](https://github.com/supabase/supabase-js)** monorepo. That upstream project is licensed under the **MIT License**; this fork incorporates upstream code under those terms. Copyright notices and license text for upstream code are preserved in **[`LICENSE`](./LICENSE)** (and in file headers where upstream placed them).
- **What BrandMatchCo added:** On top of upstream, this repo adds **BrandMatchCo–specific** behavior and tooling—primarily **proxy-first / Edge Function–oriented** client patterns (`createSecureClient`, secure DB/auth paths, optional E2EE-related flows), the **`securesupabase` CLI**, and **edge function / migration scaffolding** as described in the tables below and in [`packages/core/supabase-js/README.md`](./packages/core/supabase-js/README.md). Anything not explicitly described as an addition should be assumed to follow upstream behavior.
- **Not official Supabase:** **Supabase, Inc.** and the Supabase open-source maintainers **do not maintain, endorse, or warrant** this fork unless they state otherwise. This is an independent community/company fork. For the official JavaScript client and releases, use **[supabase/supabase-js](https://github.com/supabase/supabase-js)** and the **`@supabase/*` packages published by Supabase** on npm.
- **Trademarks:** **Supabase** and related names and logos are trademarks of their respective owners. References here are for **attribution and technical compatibility** (identifying which upstream project this derives from), not to imply affiliation or sponsorship.

This section is standard open-source attribution; it does not replace reading the MIT `LICENSE` or your own counsel for your use case.

## What this fork adds

| Capability | Purpose |
| ---------- | ------- |
| **`createSecureClient`** (and related types) | App-side client that talks to your **`db-proxy`** and **`auth-proxy`** edge functions with optional **E2EE envelopes** (public key bootstrap via **`e2ee-public-key`**). |
| **Proxy-first DB and auth** | `secure.db` / `secure.auth` are the hardened paths; other surfaces (`functions`, `storage`, Realtime) stay available on the same wrapper where appropriate. |
| **`securesupabase` CLI** | Ships with `@supabase/supabase-js` as the `securesupabase` binary: **`init`**, **`sync`**, **`functions deploy`**, and **`supabase …`** passthrough so you can vendor the SDK into `supabase/functions/_shared` and deploy the standard secure edge bundle from your app repo. |
| **Edge scaffolding** | `securesupabase init` writes vendor output, shared TS helpers (CORS, rate limits, validation, E2EE helpers, etc.), **`db-proxy`**, **`auth-proxy`**, **`e2ee-public-key`**, SQL migrations, and **`secure-edge-templates`** for RLS baselines—see the package README for the full file list. |

Detailed usage (TypeScript examples, CLI flags, fork/upstream Git remotes, deploy commands) lives here:

**[→ `packages/core/supabase-js/README.md`](./packages/core/supabase-js/README.md)**

## Monorepo layout

Libraries match upstream; everything under **`packages/core/`** is the active SDK code:

| Package | Role |
| ------- | ---- |
| [**`@supabase/supabase-js`**](./packages/core/supabase-js) | Main isomorphic SDK **plus** secure client + `securesupabase` CLI |
| [**`@supabase/auth-js`**](./packages/core/auth-js) | Authentication client |
| [**`@supabase/postgrest-js`**](./packages/core/postgrest-js) | PostgREST / database client |
| [**`@supabase/realtime-js`**](./packages/core/realtime-js) | Realtime subscriptions |
| [**`@supabase/storage-js`**](./packages/core/storage-js) | Storage client |
| [**`@supabase/functions-js`**](./packages/core/functions-js) | Edge Functions invoke helper |

> **Contributors:** the repo was restructured as a monorepo; see the **[migration guide](./docs/MIGRATION.md)** if you are coming from older paths.

## Install and quick start

**Consumers who only need the published SDK** (same package name as upstream when published from this fork):

```bash
npm install @supabase/supabase-js
```

**Global CLI from a local checkout** (typical when iterating on the fork):

```bash
npm install -g "/absolute/path/to/securesupabase-js/packages/core/supabase-js"
securesupabase init
```

Then follow **[packages/core/supabase-js/README.md](./packages/core/supabase-js/README.md)** for `createSecureClient`, edge imports (`../_shared/securesupabase.ts`), and deploy flows.

## Relationship to upstream

- **`upstream`**: [supabase/supabase-js](https://github.com/supabase/supabase-js) — pull fixes and features from here.
- **`origin`**: [brandmathco/securesupabase-js](https://github.com/brandmathco/securesupabase-js) — your fork; push feature branches and releases here.

Suggested remotes after clone:

```bash
git remote add upstream https://github.com/supabase/supabase-js.git
```

## Documentation map

| Topic | Location |
| ----- | -------- |
| Secure client + CLI + edge integration | [`packages/core/supabase-js/README.md`](./packages/core/supabase-js/README.md) |
| Monorepo migration | [`docs/MIGRATION.md`](./docs/MIGRATION.md) |
| Testing overview | [`docs/TESTING.md`](./docs/TESTING.md) |
| Releases | [`docs/RELEASE.md`](./docs/RELEASE.md) |
| Security reporting | [`docs/SECURITY.md`](./docs/SECURITY.md) |
| General Supabase JS / REST / Auth API reference | [supabase.com/docs/reference/javascript](https://supabase.com/docs/reference/javascript/introduction) |

## Contributing and tests

Contributing flow matches upstream: see **[`CONTRIBUTING.md`](./CONTRIBUTING.md)**. Run tests from the monorepo root, for example:

```bash
npx nx affected --target=test
```

## License

MIT — see **[`LICENSE`](./LICENSE)** (same as upstream unless otherwise noted).

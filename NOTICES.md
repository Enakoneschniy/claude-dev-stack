# NOTICES

This project redistributes the following third-party software. Each dependency
listed below retains its original license. Claude Dev Stack itself is MIT-licensed
(see `LICENSE`).

## Runtime Dependencies

### @anthropic-ai/claude-agent-sdk
- **Version constraint:** `^0.2.110`
- **License:** Anthropic Commercial Terms of Service
- **License URL:** https://www.anthropic.com/legal/commercial-terms
- **Redistribution basis:** Anthropic Commercial ToS permits redistribution of the SDK within products. CDS embeds the SDK as an internal infrastructure dependency of `@cds/core`; end users who run CDS are also subject to the SDK's terms via their own `ANTHROPIC_API_KEY` usage.
- **Used by:** `@cds/core` (internal infrastructure; not exposed directly to the CLI surface).

### prompts
- **Version constraint:** `^2.4.2`
- **License:** MIT
- **License URL:** https://github.com/terkelg/prompts/blob/master/license
- **Used by:** root `claude-dev-stack` CLI (interactive setup wizard) — single-runtime-dep constraint on CLI surface is preserved.

### Transitive runtime dependencies (pulled via `@anthropic-ai/claude-agent-sdk`)

<!-- TRANSITIVE_RUNTIME_DEPS_BEGIN -->
The following transitive packages ship with `@anthropic-ai/claude-agent-sdk` and its dependency graph. License audit verified 2026-04-16.

License summary: Apache-2.0 (1), BSD-2-Clause (1), BSD-3-Clause (2), ISC (7), LGPL-3.0-or-later (1 — allowlisted, see below), MIT (88), Unknown (1 — the SDK itself, per Anthropic Commercial ToS entry above).

- `@anthropic-ai/sdk@0.81.0` — MIT
- `@babel/runtime@7.29.2` — MIT
- `@hono/node-server@1.19.14` — MIT
- `@img/sharp-darwin-arm64@0.34.5` — Apache-2.0
- `@img/sharp-libvips-darwin-arm64@1.2.4` — LGPL-3.0-or-later
- `@modelcontextprotocol/sdk@1.29.0` — MIT
- `accepts@2.0.0` — MIT
- `ajv@8.18.0` — MIT
- `ajv-formats@3.0.1` — MIT
- `body-parser@2.2.2` — MIT
- `bytes@3.1.2` — MIT
- `call-bind-apply-helpers@1.0.2` — MIT
- `call-bound@1.0.4` — MIT
- `content-disposition@1.1.0` — MIT
- `content-type@1.0.5` — MIT
- `cookie@0.7.2` — MIT
- `cookie-signature@1.2.2` — MIT
- `cors@2.8.6` — MIT
- `cross-spawn@7.0.6` — MIT
- `debug@4.4.3` — MIT
- `depd@2.0.0` — MIT
- `dunder-proto@1.0.1` — MIT
- `ee-first@1.1.1` — MIT
- `encodeurl@2.0.0` — MIT
- `es-define-property@1.0.1` — MIT
- `es-errors@1.3.0` — MIT
- `es-object-atoms@1.1.1` — MIT
- `escape-html@1.0.3` — MIT
- `etag@1.8.1` — MIT
- `eventsource@3.0.7` — MIT
- `eventsource-parser@3.0.6` — MIT
- `express@5.2.1` — MIT
- `express-rate-limit@8.3.2` — MIT
- `fast-deep-equal@3.1.3` — MIT
- `fast-uri@3.1.0` — BSD-3-Clause
- `finalhandler@2.1.1` — MIT
- `forwarded@0.2.0` — MIT
- `fresh@2.0.0` — MIT
- `function-bind@1.1.2` — MIT
- `get-intrinsic@1.3.0` — MIT
- `get-proto@1.0.1` — MIT
- `gopd@1.2.0` — MIT
- `has-symbols@1.1.0` — MIT
- `hasown@2.0.2` — MIT
- `hono@4.12.14` — MIT
- `http-errors@2.0.1` — MIT
- `iconv-lite@0.7.2` — MIT
- `inherits@2.0.4` — ISC
- `ip-address@10.1.0` — MIT
- `ipaddr.js@1.9.1` — MIT
- `is-promise@4.0.0` — MIT
- `isexe@2.0.0` — ISC
- `jose@6.2.2` — MIT
- `json-schema-to-ts@3.1.1` — MIT
- `json-schema-traverse@1.0.0` — MIT
- `json-schema-typed@8.0.2` — BSD-2-Clause
- `kleur@3.0.3` — MIT
- `math-intrinsics@1.1.0` — MIT
- `media-typer@1.1.0` — MIT
- `merge-descriptors@2.0.0` — MIT
- `mime-db@1.54.0` — MIT
- `mime-types@3.0.2` — MIT
- `ms@2.1.3` — MIT
- `negotiator@1.0.0` — MIT
- `object-assign@4.1.1` — MIT
- `object-inspect@1.13.4` — MIT
- `on-finished@2.4.1` — MIT
- `once@1.4.0` — ISC
- `parseurl@1.3.3` — MIT
- `path-key@3.1.1` — MIT
- `path-to-regexp@8.4.2` — MIT
- `pkce-challenge@5.0.1` — MIT
- `proxy-addr@2.0.7` — MIT
- `qs@6.15.1` — BSD-3-Clause
- `range-parser@1.2.1` — MIT
- `raw-body@3.0.2` — MIT
- `require-from-string@2.0.2` — MIT
- `router@2.2.0` — MIT
- `safer-buffer@2.1.2` — MIT
- `send@1.2.1` — MIT
- `serve-static@2.2.1` — MIT
- `setprototypeof@1.2.0` — ISC
- `shebang-command@2.0.0` — MIT
- `shebang-regex@3.0.0` — MIT
- `side-channel@1.1.0` — MIT
- `side-channel-list@1.0.1` — MIT
- `side-channel-map@1.0.1` — MIT
- `side-channel-weakmap@1.0.2` — MIT
- `sisteransi@1.0.5` — MIT
- `statuses@2.0.2` — MIT
- `toidentifier@1.0.1` — MIT
- `ts-algebra@2.0.0` — MIT
- `type-is@2.0.1` — MIT
- `unpipe@1.0.0` — MIT
- `vary@1.1.2` — MIT
- `which@2.0.2` — ISC
- `wrappy@1.0.2` — ISC
- `zod@4.3.6` — MIT
- `zod-to-json-schema@3.25.2` — ISC

### LGPL-3.0-or-later (dynamic-linked native bindings — allowlisted)

`@img/sharp-libvips-*` packages are LGPL-3.0-or-later but are **dynamically-linked optional platform bindings** (per the libvips convention), not statically compiled into CDS. They ship only on their target platforms via npm's `optionalDependencies` resolution.

- `@img/sharp-libvips-darwin-arm64@1.2.4` — native libvips binding for sharp image processing. Pulled transitively through `@anthropic-ai/claude-agent-sdk → @modelcontextprotocol/sdk → sharp`. Unused by CDS's current runtime path (sessions/docs/planning surface) but present in the dep tree on darwin-arm64 installs.

LGPL-3.0-or-later permits linking from permissively-licensed software when the library is dynamically linked — libvips is the canonical example. This posture does not affect CDS's MIT license nor Anthropic's Commercial ToS applied to the SDK.
<!-- TRANSITIVE_RUNTIME_DEPS_END -->

### better-sqlite3
- **Version constraint:** `^12.9.0`
- **License:** MIT
- **License URL:** https://github.com/WiseLibs/better-sqlite3/blob/master/LICENSE
- **Used by:** `@cds/core` — Tier 2 SQLite session memory (per Phase 35 VAULT-01).
- **Native bindings note:** better-sqlite3 ships platform-specific prebuilds via `prebuild-install`. The pulled `@img/sharp-libvips-*` LGPL binding (see below) is a separate concern from better-sqlite3 itself (MIT native C++ bindings for SQLite, no LGPL linkage).

## Development Dependencies

Development tooling (`vitest`, `typescript`, `@types/node`) is **not redistributed**
in the published `claude-dev-stack` npm tarball (these are `devDependencies` only).
See `package.json` and `packages/*/package.json` for the full development toolchain.

## License Compliance Policy

- **Permitted:** MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Python-2.0, Unlicense, 0BSD
- **Permitted with documentation (as here):** Anthropic Commercial Terms of Service (SDK only)
- **Not permitted in runtime deps:** GPL-*, AGPL-*, SSPL-*, UNKNOWN/unreviewed

If a future transitive dependency lands under a not-permitted license, `pnpm licenses list --prod --filter @cds/core` will flag it and the CI license audit (future Phase) will block the commit. For Phase 34, Plan 01 Task 3 performs this audit manually and fails the task if any forbidden license appears.

## Questions

Report license concerns to the `claude-dev-stack` maintainers via GitHub issues. This NOTICES.md is kept in sync with `pnpm-lock.yaml` — each runtime dependency bump MUST be accompanied by a NOTICES.md update.

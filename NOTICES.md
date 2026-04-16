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
<!-- Populated by Plan 01 Task 3 after `pnpm install`. Format per entry: -->
<!--   - `<name>@<version>` — <SPDX license> -->
<!-- TRANSITIVE_RUNTIME_DEPS_END -->

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

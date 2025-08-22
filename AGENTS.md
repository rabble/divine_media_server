# Repository Guidelines

## Project Structure & Module Organization

- Source: place Cloudflare Worker code in `src/` (e.g., `src/worker.ts`, route handlers under `src/routes/`).
- Config: keep `wrangler.toml` at repo root for KV/R2/Queues/Bindings.
- Tests: add `tests/` with `*.test.ts` files mirroring `src/` layout.
- Docs: architectural notes live in `docs.md` and `df_stream_docs.md`.
- Assets/scripts: store one-off migration or tooling under `tools/`.

## Build, Test, and Development Commands

- Dev server: `wrangler dev` — runs the Worker locally with bindings.
- Deploy: `wrangler deploy` — publishes to Cloudflare.
- Test: `vitest run` or `npm test` — executes unit tests.
- Lint/format: `eslint .` and `prettier -w .` — enforce style.

If `package.json` is added, expose scripts like `dev`, `build`, `test`, `lint` that wrap the above.

## Coding Style & Naming Conventions

- Language: TypeScript preferred for Workers (`.ts`).
- Indentation: 2 spaces; max line length ~100 chars.
- Names: kebab-case for files (`request-upload.ts`), camelCase for vars/functions, PascalCase for types.
- Imports: use module paths within `src/`; avoid deep relative chains.
- Tools: Prettier for formatting, ESLint with TypeScript rules. Commit only formatted code.

## Testing Guidelines

- Framework: Vitest with `@cloudflare/workers-types` mocks or Miniflare.
- Location: tests in `tests/`, colocated `*.test.ts` allowed for small units.
- Coverage: target ≥80% for core routing and KV/R2 adapters.
- Naming: mirror source names (`request-upload.test.ts` for `request-upload.ts`).
- Run locally: `vitest --run` or `npm test`.

## Commit & Pull Request Guidelines

- Commits: follow Conventional Commits (e.g., `feat: add Stream upload route`).
- Scope small: one logical change per commit; include why, not just what.
- PRs: clear description, linked issue, test coverage, and screenshots/logs for HTTP routes.
- Checks: CI must pass lint, type-check, and tests before merge.

## Security & Configuration Tips

- Secrets: store via Wrangler (`wrangler secret put STREAM_WEBHOOK_SECRET`); don’t commit secrets.
- Bindings: define KV (sha256, vine_id, filename), R2, and Stream env in `wrangler.toml`.
- Webhooks: validate signatures; standardize on `STREAM_WEBHOOK_SECRET` (see `docs.md`).
- Redirects: implement `/media/{fileId}` and `/thumbnail/{fileId}` fallbacks per docs.

# AGENTS.md

Guide for AI agents working in this repository.

## Project

TypeScript MCP server connecting to Google consumer services (Gmail, Calendar, Meet, Drive, Contacts, Tasks) with multi-account OAuth. Package name `google-services-mcp`, executable `google-services-mcp`. ESM (`"type": "module"`), Node16 module resolution, target ES2022.

## Architecture

```
src/
  main.ts                 # bin entry: stdio serve OR cli dispatch
  server.ts               # createServer(): McpServer + registerTools
  cli.ts                  # dispatchCommand() pure command dispatch (testable)
  auth/
    config.ts             # env/file config resolution
    store.ts              # token/config persistence in data dir
    oauth.ts              # OAuth loopback flow, browser launch, CSRF state
    manager.ts            # AuthManager facade: accounts, clients, status
  services/
    gmail.ts              # send/list/get/modify/reply
    calendar.ts           # events CRUD + Meet links
    drive.ts              # files list/get/upload/update/delete/share
    contacts-tasks.ts     # contacts + tasks
    sheets.ts             # spreadsheets: get/read/write/append/create/batch
    docs.ts               # documents: get/read/create/insert/replace/batch
    slides.ts             # presentations: get/create/replace/add/delete/batch
    youtube.ts            # search/videos/playlists/playlistItems/subscriptions
    forms.ts              # forms: get/responses/create/add-question/batch
  tools/
    index.ts              # registerTools(server): 60 tools, google_ prefix
  util/
    result.ts             # ok/text/err/noAccountsHint
test/                     # vitest suites, mirrored layout
```

Data flow: MCP tool → `withClient(account, fn)` resolves a client via `authManager.getClient()` → service module calls googleapis → `ok`/`err` result → tool returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.

## Conventions

- **TDD**: write the test first, run it (see it fail), implement, run again until green. Keep suites fast.
- **Import style**: always `.js` extensions in relative imports (Node16). The vitest resolution maps `.js` → `.ts`.
- **Import depth**: top-level `test/*.test.ts` uses `../src/...`; nested `test/auth/*.test.ts` uses `../../src/...`. Wrong depth yields a confusing "Cannot find module".
- **Tools**: register with `registerTool(name, { title, description, inputSchema }, cb)` from `@modelcontextprotocol/sdk/server/mcp.js`. Zod 3.25 for schemas. `server.tool()` is deprecated.
- **Tool naming**: `google_<domain>_<action>`, snake_case — avoids collision with client-native tools.
- **Errors**: return `{ isError: true, content: [{ type: "text", text: "Error: <message>" }] }` via `err()`.
- **Vitest**: import `{ describe, expect, it, vi, beforeEach }` explicitly. Mock `googleapis` at module level with `vi.mock` factory and `vi.hoisted()` mocks.
- **Unhandled rejections in tests**: attach the `expect(promise).rejects...` assertion BEFORE the triggering `await fetch(...)` call, then `await` the assertion.

## Secret scrubber (IMPORTANT)

The environment can rewrite token-shaped object-literal keys in written/edited files (`access_token:`, `refresh_token:`, `client_secret:` — and sometimes `accessToken:`/`refreshToken:` inside mock factories) into broken `__VG_CREDENTIAL_...__` literals. Safe patterns:

- Computed keys from a const map: `const TK = { access: "accessToken" };` → `{ [TK.access]: "..." }`
- Function-argument strings, dot-assignment after creation
- `const client = {} as never;` for fake API clients in tests

After any write or edit containing token-adjacent text, verify the file on disk. Never print or log real credentials.

## Test isolation

- Don't call `vi.unstubAllEnvs()` mid-test; restore/delete the specific env vars.
- Remove `config.json` in the tmp data dir before asserting "no credentials" cases (a `beforeEach` default-account call persists creds to the tmp config file).
- `authManager` has no config cache — `getConfig()` reads env/file per call, so env changes take effect immediately.

## Commands

```
npm test             # full suite (vitest run)
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run build        # tsc → dist/
npm run dev          # tsx src/main.ts
node dist/main.js --help
```

## CLI commands

`serve` (default), `add <name>`, `list`, `remove <name>`, `set-default <name>`, `status`, `--help`, `--version`. `dispatchCommand()` is pure and unit-tested; `main.ts` owns process I/O.

## Releases (CI/CD only)

All publishing happens from GitHub Actions via npm **trusted publishing** (OIDC provenance) — no local npm login/token.

- `.github/workflows/ci.yml` — typecheck/test/build on `main` + PRs (Node 24)
- `.github/workflows/publish.yml` — the single publishing workflow (npm allows ONE trusted publisher per package; workflow filename must match):
  - push to `main` → auto-publish next patch to `latest` + create `vX.Y.Z` tag + GitHub release (version derived from last published `latest`; intentional minor/major bumps in package.json are honored)
  - tag `v*-beta*` → publish `beta` + prerelease GitHub release
  - manual dispatch → bump to next `-beta.X` prerelease (no git change), publish `beta` (staging build from `main`)

Never publish from a local shell. Stable versions are auto-derived from the npm registry on merge to `main`; manual version edits are not needed for patch releases.

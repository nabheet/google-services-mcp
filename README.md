# google-services-mcp

MCP (Model Context Protocol) server that gives AI agents direct access to your
Google services — **Gmail, Calendar, Google Meet, Drive, Contacts, Tasks,
Sheets, Docs, Slides, YouTube, and Forms** — with multi-account OAuth support.

Add one account, wire the server into any MCP-compatible AI client, and your
agent can read and send email, manage your calendar, find files in Drive,
create documents and spreadsheets, and more — using your real Google data.

## Features

- **Gmail** — send, list, read, modify, and reply to messages
- **Calendar** — list calendars, create/read/update/delete events, create Google Meet links
- **Drive** — list, read, upload, update, delete, and share files
- **Contacts** — list, search, and create contacts
- **Tasks** — list task lists, create/complete/delete tasks
- **Sheets** — create spreadsheets, read/write/append cell ranges, batch update
- **Docs** — create documents, read text, insert/replace text, batch update
- **Slides** — create presentations, add/delete slides, find-and-replace text
- **YouTube** — search videos, manage uploads/playlists/subscriptions
- **Forms** — create forms, add questions, read responses
- **Multi-account** — connect several Google accounts, set a default, or pass an `account` argument to any tool
- **OAuth 2.0** — one-time browser authorization; tokens are stored locally and refreshed automatically

> **60 tools** across 11 services, all prefixed `google_`. Full reference:
> [docs/TOOLS.md](docs/TOOLS.md).

## Requirements

- Node.js **24+** (CI runs Node 24; local dev on 26)
- A Google Cloud project with the required APIs enabled and an OAuth 2.0
  **Desktop app** client (one-time setup, ~10 minutes — see below)

## Install

No install needed — run straight from npm via `npx`:

```bash
npx -y google-services-mcp --version
```

`npx` downloads the package on first run and caches it. Every command in
this README (`add`, `list`, `status`, ...) works the same way:

```bash
npx -y google-services-mcp add personal
```

> **Pin a version for reproducibility** — check the current release with
> `npm view google-services-mcp version`, then run an exact version:
>
> ```bash
> npx -y google-services-mcp@<version> add personal
> ```
>
> MCP clients auto-launch this server, so pinning avoids surprise breakage
> when a new release ships.

### Alternative: global install

Prefer a persistent `google-services-mcp` command (and faster MCP client
startup)?

```bash
npm install -g google-services-mcp
```

Then replace `npx -y google-services-mcp` with `google-services-mcp`
everywhere below.

### Release channels

- `latest` — stable releases, published automatically on every merge to `main`
- `beta` — staging builds, published manually from `main`
  (e.g. `0.x.x-beta.0`)

Try the staging channel without touching your stable install:

```bash
npx -y google-services-mcp@beta --version
```

All publishes are signed with npm **provenance** (trusted publishing via
GitHub Actions OIDC) — no npm token is stored in CI.

## Quick start

1. **Add a Google account** — opens your browser for one-time authorization:

   ```bash
   npx -y google-services-mcp add personal
   ```

2. **Register the server** with your MCP client (see
   [MCP client configuration](#mcp-client-configuration) for Claude Desktop,
   opencode, and generic configs).

3. **Start using it** — ask your agent to "check my email" or "add an event to
   my calendar". Or add more accounts any time: `npx -y google-services-mcp add work`.

## MCP client configuration

The server speaks MCP over stdio. Point your client at the
`google-services-mcp` package via `npx` and pass your OAuth credentials via
environment variables. (If you installed globally, use `google-services-mcp`
as the command instead.)

### opencode

In `opencode.json` (or your global config):

```json
{
  "mcp": {
    "google-services-mcp": {
      "type": "local",
      "command": ["npx", "-y", "google-services-mcp"],
      "enabled": true,
      "environment": {
        "GOOGLE_MCP_CLIENT_ID": "your-client-id",
        "GOOGLE_MCP_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Claude Desktop / Cursor / other MCP clients

In the client's MCP settings file (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-services-mcp": {
      "command": "npx",
      "args": ["-y", "google-services-mcp"],
      "env": {
        "GOOGLE_MCP_CLIENT_ID": "your-client-id",
        "GOOGLE_MCP_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Google Cloud setup (one-time)

Each installation uses its own OAuth client — credentials are per-user and
never shared.

### 1. Create a project

Open the [Google Cloud Console](https://console.cloud.google.com/), choose
**Select a project → New Project**, and name it (e.g. `google-services-mcp`).

### 2. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen**:

1. User type: **External** (required for regular Google accounts).
2. App name: anything you like (e.g. `Google Service MCP`); support email = yours.
3. Under **Audience → Test users**, click **Add users** and enter **every Google
   account that will use this server**. While the app is in Testing mode,
   accounts not on this list get `access blocked` on the consent screen.

### 3. Enable the required APIs

**APIs & Services → Library**, search and **Enable** each:

`Gmail API` · `Google Calendar API` · `Google Drive API` · `People API` ·
`Google Tasks API` · `Google Sheets API` · `Google Docs API` ·
`Google Slides API` · `YouTube Data API v3` · `Google Forms API`

> **Automated:** with the `gcloud` CLI installed and authenticated
> (`gcloud auth login`), enable all 10 APIs at once — idempotent, safe to
> re-run:
>
> ```bash
> bash scripts/enable-apis.sh --project your-project-id
> ```

### 4. Create OAuth client credentials

**APIs & Services → Credentials → Create Credentials → OAuth client ID**:

1. Application type: **Desktop app**.
2. Authorized redirect URIs: `http://localhost:8787`.
3. Copy the **Client ID** and **Client Secret**.

### 5. Provide the credentials

Set these environment variables (or put them in your MCP client config as
above):

```
GOOGLE_MCP_CLIENT_ID=<your-oauth-client-id>
GOOGLE_MCP_CLIENT_SECRET=<your-oauth-client-secret>
```

Optional:

```
GOOGLE_MCP_DIR=~/.google-services-mcp   # where config and tokens live (default ~/.google-services-mcp)
GOOGLE_MCP_REDIRECT_PORT=8787          # local loopback port for OAuth (default 8787)
# Full redirect URI override. Takes precedence over REDIRECT_PORT and must
# exactly match a URI registered for this OAuth client in the Cloud Console.
# GOOGLE_MCP_REDIRECT_URI=http://127.0.0.1:8787/oauth2callback
```

### 6. Connect your first account

```bash
npx -y google-services-mcp add personal
```

A browser opens to the Google consent screen. After you approve, the account is
stored in `~/.google-services-mcp/accounts/` and ready to use. Repeat with a
different name (e.g. `work`) to connect more accounts.

## CLI reference

```
npx -y google-services-mcp                     # run the MCP server over stdio
npx -y google-services-mcp add <name>          # add a Google account (opens browser)
npx -y google-services-mcp list                # list connected accounts
npx -y google-services-mcp remove <name>       # remove an account
npx -y google-services-mcp set-default <name>  # set the default account
npx -y google-services-mcp status              # show config and token health
npx -y google-services-mcp --help              # show help
```

## For AI agents

- All tools are prefixed `google_`, e.g. `google_gmail_list`,
  `google_calendar_list_events`, `google_drive_list_files`.
- The `account` argument selects which connected account a tool uses;
  omit it to use the default account.
- Agents can connect new accounts themselves via the **`account_add`** tool —
  it opens the browser consent flow without needing the CLI.
- See [docs/TOOLS.md](docs/TOOLS.md) for the full tool reference.

## Security

- OAuth tokens are stored in `~/.google-services-mcp/accounts/<account-name>.json`
  with restrictive file permissions. Keep them private — never commit them.
- The server never logs tokens or credentials.
- Scopes requested: Gmail modify, Calendar, Drive, Contacts, Tasks, Sheets,
  Docs, Slides, YouTube, Forms, plus `userinfo.email` for account display.
- If a client secret is ever exposed, rotate it in the Google Cloud Console
  (Credentials → your OAuth client → rotate secret).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `access blocked` on consent | Account not in **Test users** (setup step 2.3) — add it and retry |
| `redirect_uri_mismatch` | Redirect URI must be exactly `http://localhost:8787` — no trailing slash — and match what your OAuth client allows |
| Tokens stop working after ~7 days | App is in **Testing** mode — re-run `add`, or **Publish app** on the consent screen |
| `npx: command not found` in the MCP client | GUI clients (Claude Desktop, Cursor) may not inherit your shell PATH — use the absolute path to `npx` (e.g. `/usr/local/bin/npx`) or install globally |
| `Google hasn't verified this app` | Normal for unverified apps — click **Advanced → Continue** for personal use |

## Local development

```bash
git clone https://github.com/nabheet/google-services-mcp.git
cd google-services-mcp
npm install
npm run build        # compile to dist/
npm test             # vitest, TDD suites
npm run typecheck    # tsc --noEmit
npm run dev          # run from source with tsx
```

See [AGENTS.md](AGENTS.md) for architecture and conventions.

## Releases (maintainers)

All publishing happens from GitHub Actions — no local npm login needed:

1. **Stable** — every merge to `main` auto-publishes the next patch version
   to `latest` with provenance, then creates a `vX.Y.Z` tag and GitHub
   release. No manual steps. The next version is derived from the last
   published `latest` on npm, so repeated merges never collide; an
   intentional minor/major bump in `package.json` is honored.
2. **Staging** — manual beta builds from `main`: **Actions → CI
   → Run workflow**. Publishes a `beta` build (`0.1.1-beta.X`) under the
   `beta` dist-tag with provenance.

Prerelease tags `v*-beta*` publish to `beta` with a prerelease GitHub release
(patch/minor builds for milestone testing). Publishing uses npm **trusted
publishing** (OIDC): configure it once per package at
`npmjs.com/package/google-services-mcp/access` with the GitHub repository
`nabheet/google-services-mcp` and workflow name `ci.yml`.
npm allows **one trusted publisher per package** and validates the calling
workflow's filename — all channels run from the same `ci.yml` file.
No `NPM_TOKEN` secret is required.

## License

MIT

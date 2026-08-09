# google-services-mcp

MCP (Model Context Protocol) server for Google consumer services — Gmail, Calendar, Google Meet, Drive, Contacts, Tasks, Sheets, Docs, Slides, YouTube, and Forms — with multi-account OAuth support.

## Features

- **Gmail** — send, list, read, modify, and reply to messages
- **Calendar** — list calendars, list/create/read/update/delete events, create Google Meet links
- **Drive** — list, read, upload, update, delete, and share files
- **Contacts** — list, search, and create contacts
- **Tasks** — list task lists, list/create/complete/delete tasks
- **Sheets** — create spreadsheets, read/write/append cell ranges, batch update
- **Docs** — create documents, read plain text, insert/replace text, batch update
- **Slides** — create presentations, add/delete slides, find-and-replace text, batch update
- **YouTube** — search videos, list your uploads/playlists/subscriptions, create/delete playlists, add videos
- **Forms** — create forms, add questions, list responses, batch update
- **Multi-account** — connect several Google accounts, switch the default, and pass an `account` argument to any tool
- **OAuth 2.0** — device-style local loopback flow opens your browser once; tokens are stored locally and refreshed automatically

## Requirements

- Node.js 18+
- A Google Cloud project with the required APIs enabled and OAuth 2.0 credentials (Desktop app type)

## Setup

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable these APIs: Gmail, Google Calendar, Google Drive, People, Tasks, Google Sheets, Google Docs, Google Slides, YouTube Data API v3, Google Forms.
3. Create OAuth client credentials, choosing **Desktop app** as the application type.
4. Set the environment variables (or provide them via your MCP client config):

   ```
   GOOGLE_MCP_CLIENT_ID=<your-oauth-client-id>
   GOOGLE_MCP_CLIENT_SECRET=<your-oauth-client-secret>
   ```

   Optional:

   ```
   GOOGLE_MCP_DIR=~/.google-mcp        # where config and tokens live (default ~/.google-mcp)
   GOOGLE_MCP_REDIRECT_PORT=8787       # local loopback port for OAuth (default 8787)
   # Optional: full redirect URI override. Takes precedence over REDIRECT_PORT and must
   # exactly match a URI registered for this OAuth client in the Cloud Console.
   # GOOGLE_MCP_REDIRECT_URI=http://127.0.0.1:8787/oauth2callback
   ```

5. Install and build:

   ```
   npm install
   npm run build
   ```

6. Connect your first account:

   ```
   google-services-mcp add personal
   ```

   This opens your browser to the Google consent screen. After you approve, the account is stored and ready to use.

## Usage

```
google-services-mcp                     # run the MCP server over stdio
google-services-mcp add <name>          # add a Google account (opens browser)
google-services-mcp list                # list connected accounts
google-services-mcp remove <name>       # remove an account
google-services-mcp set-default <name>  # set the default account
google-services-mcp status              # show config and token health
google-services-mcp --help              # show help
```

## MCP client configuration

Point your MCP client at the built entry point:

```json
{
  "mcpServers": {
    "google-services-mcp": {
      "command": "google-services-mcp",
      "env": {
        "GOOGLE_MCP_CLIENT_ID": "your-client-id",
        "GOOGLE_MCP_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

All tools are prefixed with `google_`. See [docs/TOOLS.md](docs/TOOLS.md) for the full reference.

## Security notes

- OAuth tokens are stored in `~/.google-mcp/accounts/<account-name>.json` with restrictive file permissions. Keep them private.
- The server never logs tokens or credentials.
- Scopes requested: Gmail modify, Calendar, Drive, Contacts, Tasks, Sheets, Docs, Slides, YouTube, Forms.

## Development

```
npm test            # vitest, TDD suites
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
```

See [AGENTS.md](AGENTS.md) for architecture and conventions.

## License

MIT

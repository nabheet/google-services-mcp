# Privacy Policy

_Last updated: 2026-09-20_

## Overview

`google-services-mcp` is an open-source Model Context Protocol (MCP) server
that lets AI agents access Google services — Gmail, Calendar, Google Meet,
Drive, Contacts, Tasks, Sheets, Docs, Slides, YouTube, and Forms — on your
behalf, using your own Google account and your explicit authorization.

This policy explains what data the software accesses, where it is stored, and
how you remain in control. This software is not affiliated with or endorsed by
Google.

## Data accessed

When you connect a Google account, the software requests the permissions
(scopes) it needs to perform the actions you ask it to:

- **Gmail** — read, send, and manage your email
- **Calendar** — read, create, and manage calendar events and Google Meet links
- **Drive** — list, read, upload, update, and share files
- **Contacts** — list and manage your contacts
- **Tasks** — read, create, and complete tasks
- **Sheets / Docs / Slides** — read and edit your documents and spreadsheets
- **YouTube** — search videos, manage playlists and subscriptions
- **Forms** — create forms and read responses

The software only accesses data in response to explicit commands from you or
the AI agent you run it through. It does not scan, mine, or collect your data
in the background.

## How your data is stored

- **OAuth credentials** (access and refresh tokens) are stored locally on the
  machine where the server runs, in a data directory owned by your user
  account, with file permissions restricted to your user.
- Tokens are used only to authenticate requests to Google's APIs.
- The software does not operate any cloud service and does not transmit your
  credentials to any third party.
- If you use a hosted or shared environment, credentials live only on that
  machine.

## Sharing of data

The software does not sell, rent, or share your data with any third party.
The only external recipient of your data is **Google itself**, through the
Google APIs you authorize — subject to Google's own privacy policy and the
scopes you approved during sign-in.

## Your control

- **Choose scopes carefully.** Grant only the permissions you need.
- **Disconnect at any time.** Remove an account from the server's local
  configuration, and revoke access from your
  [Google Account security page](https://myaccount.google.com/permissions).
- **Delete tokens.** Removing an account deletes its locally stored
  credentials.
- **Open source.** The full source code is public in this repository, so you
  (or anyone) can audit exactly what the software does.

## Security

- Credentials are never logged or printed.
- The OAuth flow uses the standard Google loopback (localhost) flow with
  state validation.
- You are responsible for protecting the machine and user account where the
  server runs.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised and the
change will be recorded in this repository's history.

## Contact

For questions about this policy or the software, open an issue in this
repository.
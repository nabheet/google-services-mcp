# Tools reference

All tools are prefixed `google_` to avoid collisions with client-native tools. Every tool that talks to a Google service accepts an optional `account` argument (nickname) — when omitted, the default account is used.

## Account management

### `google_account_add`
Start the OAuth consent flow to connect a new Google account. Opens a browser for sign-in.

| arg | type | notes |
|---|---|---|
| `name` | string | required. Account nickname (e.g. `personal`, `work`). |
| `openBrowser` | boolean | optional, default true. Set false to print the auth URL only. |

### `google_account_list`
List connected accounts with email and default status. No args.

### `google_account_remove`
Disconnect an account and delete its stored tokens.

| arg | type | notes |
|---|---|---|
| `name` | string | required. Account nickname to remove. |

### `google_account_set_default`
Set which account is used when no `account` is specified.

| arg | type | notes |
|---|---|---|
| `name` | string | required. Account nickname to use as default. |

### `google_account_status`
Show credential configuration, data directory, connected accounts and token health. No args.

## Gmail

### `google_gmail_send`
Send an email from the connected account.

| arg | type | notes |
|---|---|---|
| `to` | string \| string[] | required. Recipient(s). |
| `subject` | string | required. |
| `body` | string | required. |
| `cc` | string \| string[] | optional. |
| `bcc` | string \| string[] | optional. |
| `bodyType` | `text` \| `html` | optional, default `text`. |

### `google_gmail_list`
List messages, newest first, with an optional Gmail search query.

| arg | type | notes |
|---|---|---|
| `query` | string | optional. Gmail syntax, e.g. `from:bob newer_than:2d`. |
| `maxResults` | number (1–100) | optional, default 25. |

### `google_gmail_get`
Fetch a single message with parsed headers, body and attachment flags.

| arg | type | notes |
|---|---|---|
| `id` | string | required. Message ID. |

### `google_gmail_modify`
Add or remove labels on a message (mark read/unread, star, archive…).

| arg | type | notes |
|---|---|---|
| `id` | string | required. Message ID. |
| `addLabels` | string[] | optional. e.g. `STARRED`, `INBOX`, `TRASH`. |
| `removeLabels` | string[] | optional. e.g. `UNREAD`. |

### `google_gmail_reply`
Reply to an existing message inside its thread, preserving threading headers.

| arg | type | notes |
|---|---|---|
| `threadId` | string | required. Thread of the conversation. |
| `messageId` | string | required. Message being replied to. |
| `body` | string | required. |
| `bodyType` | `text` \| `html` | optional, default `text`. |

## Calendar

### `google_calendar_list_calendars`
List calendars the account can access. No args beyond `account`.

### `google_calendar_list_events`
List upcoming events, optionally filtered by time range or query.

| arg | type | notes |
|---|---|---|
| `timeMin` | string (ISO 8601) | optional, default now. |
| `timeMax` | string (ISO 8601) | optional. |
| `maxResults` | number (1–250) | optional, default 25. |
| `q` | string | optional free-text search. |
| `calendarId` | string | optional, default primary. |

### `google_calendar_create_event`
Create a timed or all-day event.

| arg | type | notes |
|---|---|---|
| `summary` | string | required. |
| `start` | string | required. RFC3339 datetime or `YYYY-MM-DD` for all-day. |
| `end` | string | required. RFC3339 datetime or `YYYY-MM-DD` (exclusive) for all-day. |
| `description` | string | optional. |
| `location` | string | optional. |
| `attendees` | string[] (emails) | optional. |
| `calendarId` | string | optional, default primary. |

### `google_calendar_create_meet`
Create a calendar event with an attached Google Meet link.

| arg | type | notes |
|---|---|---|
| `summary` | string | required. |
| `start` | string | required. RFC3339 datetime. |
| `end` | string | required. RFC3339 datetime. |
| `description` | string | optional. |
| `attendees` | string[] (emails) | optional. |
| `calendarId` | string | optional, default primary. |

### `google_calendar_get_event`
Fetch a single event by ID. Args: `eventId` (required), `calendarId` (optional).

### `google_calendar_update_event`
Partially update an existing event. `eventId` required; all other fields optional (`summary`, `description`, `location`, `start`, `end`, `attendees`, `calendarId`).

### `google_calendar_delete_event`
Delete an event by ID. Args: `eventId` (required), `calendarId` (optional).

## Drive

### `google_drive_list`
List files, newest first, with an optional query.

| arg | type | notes |
|---|---|---|
| `query` | string | optional. Drive query, e.g. `name contains "report"`. |
| `pageSize` | number (1–100) | optional, default 25. |

### `google_drive_get`
Get metadata for a single file. Args: `fileId` (required).

### `google_drive_upload`
Create a file, optionally with text content.

| arg | type | notes |
|---|---|---|
| `name` | string | required. |
| `mimeType` | string | required. e.g. `text/plain`, `application/vnd.google-apps.document`. |
| `content` | string | optional. Blank Google-native file if omitted. |
| `parentFolderId` | string | optional. |

### `google_drive_update`
Rename a file and/or replace its content. `fileId` required; `name`, `mimeType`, `content` optional.

### `google_drive_delete`
Permanently delete a file. Args: `fileId` (required).

### `google_drive_share`
Share a file with a user by email and role.

| arg | type | notes |
|---|---|---|
| `fileId` | string | required. |
| `email` | string (email) | required. |
| `role` | `reader` \| `writer` \| `commenter` | required. |
| `sendNotificationEmail` | boolean | optional, default true. |

## Contacts

### `google_contacts_list`
List the account's contacts with names, emails and phones. Arg: `pageSize` (1–100, optional, default 100).

### `google_contacts_search`
Search contacts (including non-connected) by name, email or phone. Arg: `query` (required).

### `google_contacts_create`
Create a contact. `name` required; `email`, `phone` optional.

## Tasks

### `google_tasks_list_lists`
List the account's Google Tasks lists. No args beyond `account`.

### `google_tasks_list`
List tasks in a task list. Arg: `tasklistId` (optional, default `@default`).

### `google_tasks_create`
Create a task.

| arg | type | notes |
|---|---|---|
| `title` | string | required. |
| `notes` | string | optional. |
| `due` | string (RFC3339) | optional. |
| `tasklistId` | string | optional, default `@default`. |

### `google_tasks_complete`
Mark a task completed. Args: `taskId` (required), `tasklistId` (optional).

### `google_tasks_delete`
Delete a task. Args: `taskId` (required), `tasklistId` (optional).

## Sheets

### `google_sheets_get`
Get spreadsheet metadata. Arg: `spreadsheetId` (required), `range` (optional A1 range to also read values from).

### `google_sheets_read`
Read cell values from a range as rows of strings. Args: `spreadsheetId` (required), `range` (required A1 notation), `majorDimension` (`ROWS`|`COLUMNS`, default `ROWS`).

### `google_sheets_write`
Write values to a range. Args: `spreadsheetId` (required), `range` (required), `values` (required rows of strings), `valueInputOption` (`RAW`|`USER_ENTERED`, default `USER_ENTERED`).

### `google_sheets_append`
Append rows below existing data. Args: `spreadsheetId` (required), `range` (required), `values` (required), `valueInputOption` (default `USER_ENTERED`).

### `google_sheets_create`
Create a new spreadsheet. Args: `title` (required), `sheets` (optional array of tab titles to pre-create).

### `google_sheets_batch_update`
Send raw Sheets batchUpdate requests. Args: `spreadsheetId` (required), `requests` (required array of request objects).

## Docs

### `google_docs_get`
Get a document's full JSON (body, paragraphs, runs). Arg: `documentId` (required).

### `google_docs_read`
Read a document's plain text. Arg: `documentId` (required).

### `google_docs_create`
Create a new document. Arg: `title` (required).

### `google_docs_insert_text`
Insert text into a document. Args: `documentId` (required), `text` (required), `index` (optional 0-based character index; defaults to end of document).

### `google_docs_replace_text`
Find and replace text. Args: `documentId` (required), `find` (required), `replace` (required), `matchCase` (boolean, default `true`).

### `google_docs_batch_update`
Send raw Docs batchUpdate requests. Args: `documentId` (required), `requests` (required array).

## Slides

### `google_slides_get`
Get a presentation's full JSON. Arg: `presentationId` (required).

### `google_slides_create`
Create a new presentation. Arg: `title` (required).

### `google_slides_replace_text`
Find and replace text across slides. Args: `presentationId` (required), `find` (required), `replace` (required), `matchCase` (default `true`).

### `google_slides_add_slide`
Add a blank slide. Arg: `presentationId` (required). Returns the new slide `objectId`.

### `google_slides_delete_slide`
Delete a slide. Args: `presentationId` (required), `slideObjectId` (required).

### `google_slides_batch_update`
Send raw Slides batchUpdate requests. Args: `presentationId` (required), `requests` (required array).

## YouTube

### `google_youtube_search`
Search YouTube videos. Args: `query` (required), `maxResults` (default 10). Returns `{ id, type, title, channelTitle }` per item.

### `google_youtube_get_video`
Get video details (snippet, contentDetails, statistics). Arg: `videoId` (required).

### `google_youtube_my_videos`
List the signed-in channel's uploads. Arg: `maxResults` (default 25). Returns `{ uploadsPlaylistId, videos }`.

### `google_youtube_list_playlists`
List the signed-in channel's playlists. Arg: `maxResults` (default 25).

### `google_youtube_create_playlist`
Create a playlist. Args: `title` (required), `description` (optional), `privacyStatus` (default `private`).

### `google_youtube_delete_playlist`
Delete a playlist. Arg: `playlistId` (required).

### `google_youtube_add_to_playlist`
Add a video to a playlist. Args: `playlistId` (required), `videoId` (required).

### `google_youtube_subscriptions`
List the signed-in channel's subscriptions. Arg: `maxResults` (default 50). Returns `{ title, channelId }` per item.

## Forms

### `google_forms_get`
Get a form's questions and settings. Arg: `formId` (required).

### `google_forms_responses`
List form responses. Args: `formId` (required), `pageSize` (default 100).

### `google_forms_create`
Create a new form. Arg: `title` (required). Returns the form ID and responder URI.

### `google_forms_add_question`
Add a question to a form. Args: `formId` (required), `title` (required), `description` (optional), `type` (`text`|`multiple_choice`, default `text`), `options` (array, required for multiple_choice), `required` (default `false`).

### `google_forms_batch_update`
Send raw Forms batchUpdate requests. Args: `formId` (required), `requests` (required array).


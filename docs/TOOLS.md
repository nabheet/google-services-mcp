# Tools reference

All tools are prefixed `google_` to avoid collisions with client-native tools.
Every tool that talks to a Google service accepts an optional `account`
argument (nickname) — when omitted, the default account is used.

## Account management

### `google_account_add`

Start the OAuth consent flow to connect a new Google account. Opens a browser for sign-in.

| arg | type | notes |
| --- | --- | --- |
| `name` | string | required. Account nickname (e.g. `personal`, `work`). |
| `openBrowser` | boolean | optional, default true. Set false to print the auth URL only. |

### `google_account_list`

List connected accounts with email and default status. No args.

### `google_account_remove`

Disconnect an account and delete its stored tokens.

| arg    | type   | notes                                 |
| ---    | ---    | ---                                   |
| `name` | string | required. Account nickname to remove. |

### `google_account_set_default`

Set which account is used when no `account` is specified.

| arg    | type   | notes                                         |
| ---    | ---    | ---                                           |
| `name` | string | required. Account nickname to use as default. |

### `google_account_status`

Show credential configuration, data directory, connected accounts and token health. No args.

## Gmail

### `google_gmail_send`

Send an email from the connected account.

| arg | type | notes |
| --- | --- | --- |
| `to` | string \| string[] | required. Recipient(s). |
| `subject` | string | required. |
| `body` | string | required. |
| `cc` | string \| string[] | optional. |
| `bcc` | string \| string[] | optional. |
| `bodyType` | `text` \| `html` | optional, default `text`. |
| `attachments` | object[] | optional. Local files to attach: `{ path, filename?, mimeType? }`. |
| `driveFileIds` | string[] | optional. Drive files by ID (under Gmail limit). |
| `from` | string | optional. Send-as alias or address for the From header. |
| `replyTo` | string | optional. Address for the Reply-To header. |

### `google_gmail_list`

List messages, newest first, with an optional Gmail search query.

| arg | type | notes |
| --- | --- | --- |
| `query` | string | optional. Gmail syntax, e.g. `from:bob newer_than:2d`. |
| `maxResults` | number (1–100) | optional, default 25. |

### `google_gmail_get`

Fetch a single message with parsed headers, body and attachment metadata.

| arg  | type   | notes                 |
| ---  | ---    | ---                   |
| `id` | string | required. Message ID. |

### `google_gmail_modify`

Add or remove labels on a message (mark read/unread, star, archive…).

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Message ID. |
| `addLabels` | string[] | optional. e.g. `STARRED`, `INBOX`, `TRASH`. |
| `removeLabels` | string[] | optional. e.g. `UNREAD`. |

### `google_gmail_reply`

Reply to an existing message inside its thread, preserving threading headers.

| arg | type | notes |
| --- | --- | --- |
| `threadId` | string | required. Thread of the conversation. |
| `messageId` | string | required. Message being replied to. |
| `body` | string | required. |
| `bodyType` | `text` \| `html` | optional, default `text`. |
| `attachments` | object[] | optional. Local files to attach: `{ path, filename?, mimeType? }`. |
| `driveFileIds` | string[] | optional. Drive files by ID (under Gmail limit). |
| `from` | string | optional. Send-as alias or address for the From header. |
| `replyTo` | string | optional. Address for the Reply-To header. |

### `google_gmail_list_attachments`

List attachments on a message (metadata only, no bytes).

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Message ID. |

### `google_gmail_get_attachment`

Download a single attachment by message ID and attachment ID. Text-like files
are returned decoded as text; binary files as base64.

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Message ID. |
| `attachmentId` | string | required. From `list_attachments`. |
| `partId` | string | optional. Stable part ID from `list_attachments` (preferred). |

### `google_gmail_drafts_create`

Create a draft email (not sent).

| arg | type | notes |
| --- | --- | --- |
| `to` | string \| string[] | required. Recipient(s). |
| `subject` | string | required. |
| `body` | string | required. |
| `cc` | string \| string[] | optional. |
| `bcc` | string \| string[] | optional. |
| `bodyType` | `text` \| `html` | optional, default `text`. |
| `attachments` | object[] | optional. Local files to attach: `{ path, filename?, mimeType? }`. |
| `driveFileIds` | string[] | optional. Drive files by ID (under Gmail limit). |
| `from` | string | optional. Send-as alias or address for the From header. |
| `replyTo` | string | optional. Address for the Reply-To header. |

### `google_gmail_drafts_list`

List draft emails.

| arg | type | notes |
| --- | --- | --- |
| `maxResults` | number (1–100) | optional, default 25. |

### `google_gmail_drafts_get`

Fetch a single draft with parsed headers, body and attachment metadata.

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Draft ID. |

### `google_gmail_drafts_send`

Send an existing draft email.

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Draft ID. |

### `google_gmail_drafts_delete`

Delete a draft email.

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Draft ID. |

### `google_gmail_labels_list`

List all Gmail labels. No args beyond `account`.

### `google_gmail_labels_create`

Create a custom Gmail label.

| arg | type | notes |
| --- | --- | --- |
| `name` | string | required. Label name. |
| `messageListVisibility` | string | optional. e.g. `show` or `hide`. |
| `labelListVisibility` | string | optional. e.g. `labelShow` or `labelHide`. |

### `google_gmail_labels_delete`

Delete a Gmail label.

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Label ID. |

### `google_gmail_labels_update`

Update a Gmail label (partial).

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Label ID. |
| `name` | string | optional. New label name. |
| `messageListVisibility` | string | optional. e.g. `show` or `hide`. |
| `labelListVisibility` | string | optional. e.g. `labelShow` or `labelHide`. |

### `google_gmail_vacation_get`

Get the Gmail vacation (out-of-office) responder settings. No args beyond `account`.

### `google_gmail_vacation_update`

Update the vacation responder.

| arg | type | notes |
| --- | --- | --- |
| `enableAutoReply` | boolean | optional. Turn auto-reply on/off. |
| `responseSubject` | string | optional. |
| `responseBodyPlainText` | string | optional. |
| `responseBodyHtml` | string | optional. |
| `startTime` | string | optional. ms epoch string. |
| `endTime` | string | optional. ms epoch string. |

### `google_gmail_sendas_list`

List Gmail send-as aliases. No args beyond `account`.

### `google_gmail_sendas_create`

Create a Gmail send-as alias (subject to domain/verification rules).

| arg | type | notes |
| --- | --- | --- |
| `sendAsEmail` | string | required. |
| `displayName` | string | optional. |
| `isDefault` | boolean | optional. |

### `google_gmail_filters_list`

List Gmail filters (auto-archive/apply rules). No args beyond `account`.

### `google_gmail_filters_create`

Create a Gmail filter with match criteria and an action.

| arg | type | notes |
| --- | --- | --- |
| `criteria` | object | optional. `from`, `to`, `subject`, `query`, `hasAttachment`. |
| `action` | object | opt. `addLabelIds`, `removeLabelIds`, `forward`. |

### `google_gmail_filters_delete`

Delete a Gmail filter. Arg: `id` (required).

### `google_gmail_trash`

Move a message to trash.

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Message ID. |

### `google_gmail_untrash`

Restore a message from trash.

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Message ID. |

### `google_gmail_delete`

Permanently delete a message (irreversible).

| arg | type | notes |
| --- | --- | --- |
| `id` | string | required. Message ID. |

## Calendar

### `google_calendar_list_calendars`

List calendars the account can access. No args beyond `account`.

### `google_calendar_create`

Create a secondary calendar.

| arg | type | notes |
| --- | --- | --- |
| `summary` | string | required. Calendar name. |
| `timeZone` | string | optional. IANA timezone (e.g. `America/Los_Angeles`). |
| `description` | string | optional. |

### `google_calendar_update`

Partially update a calendar's metadata. `calendarId` required; all other
fields optional. `summary`, `timeZone`, `description` update the calendar
itself; `colorId` (1–24) updates the calendar's color in your view.

| arg | type | notes |
| --- | --- | --- |
| `calendarId` | string | required. Calendar ID. |
| `summary` | string | optional. New calendar name. |
| `colorId` | string | optional. Color ID (1–24). |
| `timeZone` | string | optional. IANA timezone. |
| `description` | string | optional. |

### `google_calendar_delete`

Delete a secondary calendar permanently (destructive). Args: `calendarId`
(required).

### `google_calendar_list_events`

List upcoming events, optionally filtered by time range or query.

| arg | type | notes |
| --- | --- | --- |
| `timeMin` | string (ISO 8601) | optional, default now. |
| `timeMax` | string (ISO 8601) | optional. |
| `maxResults` | number (1–250) | optional, default 25. |
| `q` | string | optional free-text search. |
| `calendarId` | string | optional, default primary. |

### `google_calendar_create_event`

Create a timed or all-day event.

| arg | type | notes |
| --- | --- | --- |
| `summary` | string | required. |
| `start` | string | required. RFC3339 datetime or `YYYY-MM-DD` for all-day. |
| `end` | string | required. RFC3339 datetime or `YYYY-MM-DD` (exclusive) for all-day. |
| `description` | string | optional. |
| `location` | string | optional. |
| `attendees` | string[] (emails) | optional. |
| `timeZone` | string | optional. IANA zone; required for recurring timed events. |
| `recurrence` | string[] | optional. RRULE strings, e.g. `["RRULE:FREQ=WEEKLY;BYDAY=TH"]`. |
| `reminderMethod` | enum | optional. `email` or `popup`. |
| `reminderMinutes` | number | optional. Minutes before event. |
| `remindersUseDefault` | boolean | optional. Use calendar default reminders instead of overrides. |
| `sendUpdates` | enum | optional. `all`, `externalOnly`, or `none`. |
| `transparency` | enum | optional. `opaque` (busy) or `transparent` (free). |
| `colorId` | string | optional. Event color ID (1-11). |
| `calendarId` | string | optional, default primary. |

### `google_calendar_create_meet`

Create a calendar event with an attached Google Meet link.

| arg | type | notes |
| --- | --- | --- |
| `summary` | string | required. |
| `start` | string | required. RFC3339 datetime. |
| `end` | string | required. RFC3339 datetime. |
| `description` | string | optional. |
| `attendees` | string[] (emails) | optional. |
| `calendarId` | string | optional, default primary. |

### `google_calendar_get_event`

Fetch a single event by ID. Args: `eventId` (required), `calendarId` (optional).

### `google_calendar_update_event`

Partially update an existing event. `eventId` required; all other fields
optional (`summary`, `description`, `location`, `start`, `end`, `attendees`,
`timeZone`, `recurrence`, `reminderMethod`, `reminderMinutes`,
`remindersUseDefault`, `sendUpdates`, `transparency`, `colorId`, `calendarId`).

### `google_calendar_delete_event`

Delete an event by ID. Args: `eventId` (required), `calendarId` (optional).

### `google_calendar_respond`

Accept, decline, or mark tentative an event invite by setting the attendee
responseStatus.

| arg | type | notes |
| --- | --- | --- |
| `eventId` | string | required. |
| `responseStatus` | `accepted` / `declined` / `tentative` | required. |
| `email` | string | optional. Attendee email to respond as (defaults to signed-in account). |
| `sendUpdates` | `all` / `externalOnly` / `none` | optional. Who to notify. |
| `calendarId` | string | optional. Default primary. |

### `google_calendar_free_busy`

Query busy intervals across calendars to find free meeting windows. Everything
outside the returned busy intervals is free.

| arg | type | notes |
| --- | --- | --- |
| `timeMin` | string | required. RFC3339 datetime. |
| `timeMax` | string | required. RFC3339 datetime. |
| `items` | string[] | optional. Calendar IDs to query (default primary). |
| `timeZone` | string | optional. IANA timezone, e.g. America/Los_Angeles. |

## Drive

### `google_drive_list`

List files, newest first, with an optional query.

| arg | type | notes |
| --- | --- | --- |
| `query` | string | optional. Drive query, e.g. `name contains "report"`. |
| `pageSize` | number (1–100) | optional, default 25. |

### `google_drive_get`

Get metadata for a single file. Args: `fileId` (required).

### `google_drive_upload`

Create a file, optionally with text content or from a local file path.

| arg | type | notes |
| --- | --- | --- |
| `name` | string | required. |
| `mimeType` | string | required. e.g. `text/plain`, `image/png`, Google-native. |
| `content` | string | optional. Text content. Blank Google-native file if omitted. |
| `path` | string | optional. Local path, reads raw bytes (binary-safe). Use instead of `content`. |
| `parentFolderId` | string | optional. |

### `google_drive_update`

Rename a file and/or replace its content (text or local file path). `fileId`
required; `name`, `mimeType`, `content`, `path` optional.

### `google_drive_delete`

Permanently delete a file. Args: `fileId` (required).

> IRREVERSIBLE. Prefer `google_drive_trash` (recoverable) as the safer default.

### `google_drive_trash`

Move a file to trash (recoverable). Args: `fileId` (required). Sets
`trashed: true` via `files.update`.

### `google_drive_restore`

Restore a trashed file. Args: `fileId` (required). Sets `trashed: false` via
`files.update`.

### `google_drive_share`

Share a file with a user/group by email, anyone with the link, or a domain;
optionally transfer ownership.

| arg | type | notes |
| --- | --- | --- |
| `fileId` | string | required. |
| `email` | string (email) | optional. Required for type `user`/`group`. |
| `role` | `reader` \| `writer` \| `commenter` \| `owner` | required. |
| `type` | `user` \| `group` \| `anyone` \| `domain` | optional, default `user`. |
| `domain` | string | optional. For type `domain`, e.g. `example.com`. |
| `transferOwnership` | boolean | optional. Transfer ownership (requires role `owner`). |
| `sendNotificationEmail` | boolean | optional, default true. |

### `google_drive_list_permissions`

List who can access a file and with what role. Args: `fileId` (required).

### `google_drive_delete_permission`

Revoke a permission from a file by permission ID. Args: `fileId` (required),
`permissionId` (required, from `google_drive_list_permissions`).

### `google_drive_download`

Download a file's raw bytes (non-Google-native files). Text content returns
decoded text; binary returns base64. Pass `saveToPath` to write bytes to a
local file instead (returns `{ savedTo }`).

| arg | type | notes |
| --- | --- | --- |
| `fileId` | string | required. Drive file ID. |
| `saveToPath` | string | optional. Local path to write the raw bytes to. |

### `google_drive_export`

Export a Google-native file (Docs/Sheets/Slides/Drawings) to another format.

| arg | type | notes |
| --- | --- | --- |
| `fileId` | string | required. Drive file ID. |
| `mimeType` | string | required. Target MIME type, e.g. `application/pdf`. |

### `google_drive_create_folder`

Create a folder in Drive.

| arg | type | notes |
| --- | --- | --- |
| `name` | string | required. Folder name. |
| `parentFolderId` | string | optional. Parent folder ID (root if omitted). |

### `google_drive_copy`

Copy a file, optionally with a new name.

| arg | type | notes |
| --- | --- | --- |
| `fileId` | string | required. Drive file ID. |
| `name` | string | optional. New name. |

### `google_drive_move`

Move a file into a folder. Provide `removeParentFolderId` (the file's current
folder) to remove it from there — a true move; omit it to add the file to an
additional folder.

| arg | type | notes |
| --- | --- | --- |
| `fileId` | string | required. Drive file ID. |
| `parentFolderId` | string | required. Destination folder ID. |
| `removeParentFolderId` | string | optional. Current folder ID to remove the file from. |

## Contacts

### `google_contacts_list`

List the account's contacts with names, emails and phones. Arg: `pageSize`
(1–100, optional, default 100).

### `google_contacts_search`

Search contacts (including non-connected) by name, email or phone. Arg: `query` (required).

### `google_contacts_create`

Create a contact. `name` required; `email`, `phone`, `address`, `organization`,
`photoBytes` optional. `photoBytes` is base64 JPEG/PNG set after creation.

### `google_contacts_update`

Update an existing contact (name, email, phone, address, organization, photo) by
resourceName. Partial update; etag fetched automatically unless supplied.

| arg | type | notes |
| --- | --- | --- |
| `resourceName` | string | required. e.g. `people/123` (from list/search). |
| `name` | string | optional. New full name. |
| `email` | string (email) | optional. New email. |
| `phone` | string | optional. New phone number. |
| `address` | string | optional. Freeform postal address. |
| `organization` | string | optional. |
| `photoBytes` | string | optional. Base64 JPEG/PNG photo. |

### `google_contacts_get`

Get a contact by resourceName with rich fields (name, email, phone, address,
organization). Arg: `resourceName` (required).

### `google_contacts_delete`

Delete a contact by resourceName. Arg: `resourceName` (required).

## Tasks

### `google_tasks_list_lists`

List the account's Google Tasks lists. No args beyond `account`.

### `google_tasks_list`

List tasks in a task list.

| arg | type | notes |
| --- | --- | --- |
| `tasklistId` | string | optional, default `@default`. |
| `dueBefore` | string (RFC3339) | optional. Only tasks due at or before this time. |
| `dueAfter` | string (RFC3339) | optional. Only tasks due at or after this time. |

### `google_tasks_create`

Create a task, optionally as a subtask.

| arg | type | notes |
| --- | --- | --- |
| `title` | string | required. |
| `notes` | string | optional. |
| `due` | string (RFC3339) | optional. |
| `parentTaskId` | string | optional. Parent task ID to create a subtask. |
| `tasklistId` | string | optional, default `@default`. |

### `google_tasks_update`

Update a task (partial).

| arg | type | notes |
| --- | --- | --- |
| `taskId` | string | required. |
| `title` | string | optional. |
| `notes` | string | optional. |
| `due` | string (RFC3339) | optional. |
| `status` | `needsAction` / `completed` | optional. |
| `tasklistId` | string | optional, default `@default`. |

### `google_tasks_complete`

Mark a task completed. Args: `taskId` (required), `tasklistId` (optional).

### `google_tasks_delete`

Delete a task. Args: `taskId` (required), `tasklistId` (optional).

### `google_tasks_create_list`

Create a new task list. Arg: `title` (required).

### `google_tasks_update_list`

Rename a task list. Args: `tasklistId` (required), `title` (required).

### `google_tasks_delete_list`

Delete a task list (removes its tasks). Arg: `tasklistId` (required).

## Sheets

### `google_sheets_get`

Get spreadsheet metadata. Arg: `spreadsheetId` (required), `range` (optional
A1 range to also read values from).

### `google_sheets_read`

Read cell values from a range as rows of strings. Args: `spreadsheetId`
(required), `range` (required A1 notation), `majorDimension`
(`ROWS`|`COLUMNS`, default `ROWS`).

### `google_sheets_write`

Write values to a range. Args: `spreadsheetId` (required), `range`
(required), `values` (required rows of strings), `valueInputOption`
(`RAW`|`USER_ENTERED`, default `USER_ENTERED`).

### `google_sheets_append`

Append rows below existing data. Args: `spreadsheetId` (required), `range`
(required), `values` (required), `valueInputOption` (default `USER_ENTERED`).

### `google_sheets_create`

Create a new spreadsheet. Args: `title` (required), `sheets` (optional array of tab titles to pre-create).

### `google_sheets_add_sheet`

Add a new tab (sheet) to a spreadsheet.

| arg | type | notes |
| --- | --- | --- |
| `spreadsheetId` | string | required. |
| `title` | string | required. Title of the new tab. |
| `index` | number (int ≥ 0) | optional. 0-based insert position; appended at end if omitted. |

### `google_sheets_delete_sheet`

Permanently delete a tab (sheet) from a spreadsheet. Args: `spreadsheetId`
(required), `sheetId` (required numeric sheet ID, from `google_sheets_get`
metadata).

### `google_sheets_rename_sheet`

Rename a tab (sheet) in a spreadsheet. Args: `spreadsheetId` (required),
`sheetId` (required numeric sheet ID), `title` (required new tab title).

### `google_sheets_insert_rows`

Insert blank rows. Args: `spreadsheetId`, `sheetId`, `startIndex` (required,
0-based), `numRows` (default 1).

### `google_sheets_delete_rows`

Delete rows. Args: `spreadsheetId`, `sheetId`, `startIndex` (required, 0-based),
`numRows` (default 1).

### `google_sheets_get_named_ranges`

List named ranges. Arg: `spreadsheetId` (required). Returns
`{ name, namedRangeId, range }` per range.

### `google_sheets_set_named_range`

Create a named range. Args: `spreadsheetId`, `name` (required), `range`
(required grid region: `sheetId` plus optional row/column index bounds).

### `google_sheets_batch_update`

Send raw Sheets batchUpdate requests. Args: `spreadsheetId` (required),
`requests` (required array of request objects).

## Docs

### `google_docs_get`

Get a document's full JSON (body, paragraphs, runs). Arg: `documentId` (required).

### `google_docs_read`

Read a document's plain text. Arg: `documentId` (required).

### `google_docs_create`

Create a new document. Arg: `title` (required).

### `google_docs_insert_text`

Insert text into a document. Args: `documentId` (required), `text`
(required), `index` (optional 0-based character index; defaults to end of
document).

### `google_docs_replace_text`

Find and replace text. Args: `documentId` (required), `find` (required),
`replace` (required), `matchCase` (boolean, default `true`).

### `google_docs_batch_update`

Send raw Docs batchUpdate requests. Args: `documentId` (required), `requests` (required array).

## Slides

### `google_slides_get`

Get a presentation's full JSON. Arg: `presentationId` (required).

### `google_slides_create`

Create a new presentation. Arg: `title` (required).

### `google_slides_replace_text`

Find and replace text across slides. Args: `presentationId` (required),
`find` (required), `replace` (required), `matchCase` (default `true`).

### `google_slides_add_slide`

Add a blank slide. Arg: `presentationId` (required). Returns the new slide `objectId`.

### `google_slides_delete_slide`

Delete a slide. Args: `presentationId` (required), `slideObjectId` (required).

### `google_slides_get_page`

Get the contents of a single slide page by object ID. Args:
`presentationId` (required), `pageObjectId` (required).

### `google_slides_batch_update`

Send raw Slides batchUpdate requests. Args: `presentationId` (required), `requests` (required array).

### `google_slides_duplicate_slide`

Duplicate a slide. Args: `presentationId`, `slideObjectId` (required).
Returns the new slide object ID.

### `google_slides_move_slide`

Move a slide to a new position. Args: `presentationId`, `slideObjectId`,
`insertionIndex` (required, 0-based).

### `google_slides_create_textbox`

Add a text box to a slide, optionally with initial text. Args: `presentationId`,
`pageObjectId` (required), `text`, `width` (default 100), `height` (default 50),
`x`, `y` (points).

### `google_slides_create_image`

Insert an image from a URL onto a slide. Args: `presentationId`, `pageObjectId`,
`url` (required), `width` (default 200), `height` (default 150), `x`, `y` (points).

## YouTube

### `google_youtube_search`

Search YouTube videos. Args: `query` (required), `maxResults` (default 10).
Returns `{ id, type, title, channelTitle }` per item.

### `google_youtube_get_video`

Get video details (snippet, contentDetails, statistics). Arg: `videoId` (required).

### `google_youtube_upload`

Upload a video to YouTube via `videos.insert` (multipart). Provide either a
local `path` (preferred, streamed) or base64 `content` (small files only) —
never both. Defaults to `private`; set `notifySubscribers` only if intended.

| arg | type | notes |
| --- | --- | --- |
| `path` | string | optional. Local file path. |
| `content` | string | optional. Base64 bytes. Mutually exclusive with `path`. |
| `title` | string | required. |
| `description` | string | optional. |
| `tags` | string[] | optional. |
| `privacyStatus` | enum | optional. `public`, `private`, or `unlisted` (default `private`). |
| `categoryId` | string | optional. YouTube category ID. |
| `notifySubscribers` | boolean | optional. Default `false`. |

Note: uploading consumes significant YouTube API quota (~1600 units per
video). Keep videos private until ready.

### `google_youtube_update_video`

Update a video's title, description, tags, or privacy status. All fields
optional except `videoId`.

| arg | type | notes |
| --- | --- | --- |
| `videoId` | string | required. |
| `title` | string | optional. New title. |
| `description` | string | optional. New description. |
| `tags` | string[] | optional. New tags. |
| `privacyStatus` | enum | optional. `public`, `private`, or `unlisted`. |

Note: private videos are not usable with the comment APIs — they report
`commentsDisabled`. Use unlisted/public for comment workflows.

### `google_youtube_my_videos`

List the signed-in channel's uploads. Arg: `maxResults` (default 25).
Returns `{ uploadsPlaylistId, videos }`.

### `google_youtube_list_playlists`

List the signed-in channel's playlists. Arg: `maxResults` (default 25).

### `google_youtube_create_playlist`

Create a playlist. Args: `title` (required), `description` (optional), `privacyStatus` (default `private`).

### `google_youtube_delete_playlist`

Delete a playlist. Arg: `playlistId` (required).

### `google_youtube_add_to_playlist`

Add a video to a playlist. Args: `playlistId` (required), `videoId` (required).

### `google_youtube_remove_from_playlist`

Remove a video from a playlist. Arg: `playlistItemId` (required). To find the
playlist item ID for a video, list the playlist and match the item by video ID.

### `google_youtube_list_comments`

List comment threads for a video, most recent first. Args: `videoId`
(required), `maxResults` (1–100, optional, default 20). Returns
`{ id, authorDisplayName, textDisplay, likeCount, publishedAt }` per thread.

### `google_youtube_insert_comment`

Post a top-level comment on a video. Args: `videoId` (required), `text`
(required). Note: comment threads may take a few seconds to appear in
`google_youtube_list_comments` (API eventual consistency).

### `google_youtube_set_comment_moderation`

Set a comment's moderation status. Args: `commentId` (required),
`moderationStatus` (required: `heldForReview`, `published`, or `rejected`).

### `google_youtube_mark_comment_spam`

Mark a comment as spam. Arg: `commentId` (required).

### `google_youtube_subscriptions`

List the signed-in channel's subscriptions. Arg: `maxResults` (default
50). Returns `{ title, channelId }` per item.

## Forms

### `google_forms_get`

Get a form's questions and settings. Arg: `formId` (required).

### `google_forms_responses`

List form responses. Args: `formId` (required), `pageSize` (default 100).

### `google_forms_create`

Create a new form. Arg: `title` (required). Returns the form ID and responder URI.

### `google_forms_add_question`

Add a question to a form. Args: `formId` (required), `title` (required),
`description` (optional), `type` (`text`|`multiple_choice`, default `text`),
`options` (array, required for multiple_choice), `required` (default `false`).

### `google_forms_update_question`

Update a question's title, description, options or required flag. Args:
`formId`, `questionId` (required), `title`, `description`, `options`,
`required` (all optional).

### `google_forms_delete_question`

Delete a question by `questionId`. Args: `formId`, `questionId` (required).

### `google_forms_move_question`

Reorder a question. Args: `formId`, `questionId`, `newIndex` (required,
0-based item index).

### `google_forms_rename`

Rename a form. Args: `formId`, `title` (required).

### `google_forms_delete`

Permanently delete a form. Arg: `formId` (required).

### `google_forms_export_responses`

Append form responses to a spreadsheet. Args: `formId`, `spreadsheetId`
(required), `sheetName` (default `Sheet1`).

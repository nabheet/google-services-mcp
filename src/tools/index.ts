import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../util/result.js";
import { authManager } from "../auth/manager.js";
import {
  sendGmail,
  listGmailMessages,
  getGmailMessage,
  modifyGmailMessage,
  replyGmail,
  listGmailAttachments,
  getGmailAttachment,
  createGmailDraft,
  listGmailDrafts,
  getGmailDraft,
  sendGmailDraft,
  deleteGmailDraft,
  listGmailLabels,
  createGmailLabel,
  deleteGmailLabel,
  trashGmailMessage,
  untrashGmailMessage,
  deleteGmailMessage,
} from "../services/gmail.js";
import {
  listCalendars,
  listEvents,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  createMeetLink,
} from "../services/calendar.js";
import {
  listDriveFiles,
  getDriveFile,
  uploadDriveFile,
  updateDriveFile,
  deleteDriveFile,
  shareDriveFile,
  downloadDriveFile,
  exportDriveFile,
  createDriveFolder,
  copyDriveFile,
} from "../services/drive.js";
import {
  listContacts,
  searchContacts,
  createContact,
  listTaskLists,
  listTasks,
  createTask,
  completeTask,
  deleteTask,
} from "../services/contacts-tasks.js";
import {
  getSpreadsheet,
  readSheetRange,
  writeSheetRange,
  appendSheetRange,
  createSpreadsheet,
  batchUpdateSheet,
} from "../services/sheets.js";
import {
  getDocument,
  getDocumentText,
  createDocument,
  insertText,
  replaceAllText,
  batchUpdateDocument,
} from "../services/docs.js";
import {
  getPresentation,
  getSlidePage,
  createPresentation,
  replaceAllText as replaceSlidesText,
  createSlide,
  deleteSlide,
  batchUpdatePresentation,
} from "../services/slides.js";
import {
  searchVideos,
  getVideo,
  getMyVideos,
  listPlaylists,
  createPlaylist,
  deletePlaylist,
  addVideoToPlaylist,
  listSubscriptions,
} from "../services/youtube.js";
import {
  getForm,
  getFormResponses,
  createForm,
  addQuestion,
} from "../services/forms.js";

/** Wrap a service call that resolves its own auth client. */
async function withClient<T>(
  account: string | undefined,
  fn: (client: any) => Promise<T>
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const client = await authManager.getClient(account);
    return ok(await fn(client));
  } catch (error) {
    return err(error);
  }
}

export function registerTools(server: McpServer): void {
  // ---- Account management -------------------------------------------------
  server.registerTool(
    "google_account_add",
    {
      title: "Add a Google account",
      description: "Start the OAuth consent flow to connect a new Google account. Opens a browser for sign-in.",
      inputSchema: {
        name: z.string().describe("Nickname for the account (e.g. personal, work)."),
        openBrowser: z.boolean().optional().describe("Open a browser automatically (default true)."),
      },
    },
    async ({ name, openBrowser }) => {
      try {
        const account = await authManager.addAccount(name, { openBrowser });
        return ok({ status: "added", name: account.name, email: account.email });
      } catch (error) {
        return err(error);
      }
    }
  );

  server.registerTool(
    "google_account_list",
    {
      title: "List connected Google accounts",
      description: "List all connected accounts with their email and default status.",
      inputSchema: {},
    },
    async () => {
      try {
        const accounts = await authManager.listAccounts();
        const status = await authManager.getStatus();
        return ok({
          defaultAccount: status.defaultAccount,
          accounts: accounts.map((a) => ({ name: a.name, email: a.email })),
        });
      } catch (error) {
        return err(error);
      }
    }
  );

  server.registerTool(
    "google_account_remove",
    {
      title: "Remove a Google account",
      description: "Disconnect an account and delete its stored tokens.",
      inputSchema: {
        name: z.string().describe("Account nickname to remove."),
      },
    },
    async ({ name }) => {
      try {
        const removed = await authManager.removeAccount(name);
        return ok({ status: removed ? "removed" : "not_found", name });
      } catch (error) {
        return err(error);
      }
    }
  );

  server.registerTool(
    "google_account_set_default",
    {
      title: "Set the default Google account",
      description: "Set which account is used when no account is specified.",
      inputSchema: {
        name: z.string().describe("Account nickname to use as default."),
      },
    },
    async ({ name }) => {
      try {
        await authManager.setDefaultAccount(name);
        return ok({ status: "set", defaultAccount: name });
      } catch (error) {
        return err(error);
      }
    }
  );

  server.registerTool(
    "google_account_status",
    {
      title: "Google services status",
      description: "Show credential configuration, data directory, connected accounts and token health.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await authManager.getStatus());
      } catch (error) {
        return err(error);
      }
    }
  );

  // ---- Gmail --------------------------------------------------------------
  server.registerTool(
    "google_gmail_send",
    {
      title: "Send email",
      description: "Send an email from the connected account.",
      inputSchema: {
        to: z.union([z.string(), z.array(z.string())]).describe("Recipient email(s)."),
        subject: z.string().describe("Subject line."),
        body: z.string().describe("Message body."),
        cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipient(s)."),
        bcc: z.union([z.string(), z.array(z.string())]).optional().describe("BCC recipient(s)."),
        bodyType: z.enum(["text", "html"]).optional().describe("Body format (default text)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ to, subject, body, cc, bcc, bodyType, account }) =>
      withClient(account, (client) => sendGmail(client, { to, subject, body, cc, bcc, bodyType }))
  );

  server.registerTool(
    "google_gmail_list",
    {
      title: "List emails",
      description: "List messages from the inbox, newest first, with an optional Gmail search query.",
      inputSchema: {
        query: z.string().optional().describe("Gmail search query (e.g. from:bob, newer_than:2d)."),
        maxResults: z.number().min(1).max(100).optional().describe("Max messages (default 25)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ query, maxResults, account }) => withClient(account, (client) => listGmailMessages(client, { query, maxResults }))
  );

  server.registerTool(
    "google_gmail_get",
    {
      title: "Read an email",
      description: "Fetch a single message with parsed headers, body and attachment flags.",
      inputSchema: {
        id: z.string().describe("Message ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => withClient(account, (client) => getGmailMessage(client, { id }))
  );

  server.registerTool(
    "google_gmail_modify",
    {
      title: "Modify email labels",
      description: "Add or remove labels on a message (e.g. mark read/unread, star, archive).",
      inputSchema: {
        id: z.string().describe("Message ID."),
        addLabels: z.array(z.string()).optional().describe("Labels to add (e.g. STARRED, INBOX, TRASH)."),
        removeLabels: z.array(z.string()).optional().describe("Labels to remove (e.g. UNREAD)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, addLabels, removeLabels, account }) =>
      withClient(account, (client) => modifyGmailMessage(client, { id, addLabels, removeLabels }))
  );

  server.registerTool(
    "google_gmail_reply",
    {
      title: "Reply to an email",
      description: "Reply to an existing message inside its thread, preserving threading headers.",
      inputSchema: {
        threadId: z.string().describe("Thread ID of the conversation."),
        messageId: z.string().describe("ID of the message being replied to."),
        body: z.string().describe("Reply body."),
        bodyType: z.enum(["text", "html"]).optional().describe("Body format (default text)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ threadId, messageId, body, bodyType, account }) =>
      withClient(account, (client) => replyGmail(client, { threadId, messageId, body, bodyType }))
  );

  server.registerTool(
    "google_gmail_list_attachments",
    {
      title: "List email attachments",
      description: "List attachments on a message (metadata only, no bytes).",
      inputSchema: {
        id: z.string().describe("Message ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => withClient(account, (client) => listGmailAttachments(client, { id }))
  );

  server.registerTool(
    "google_gmail_get_attachment",
    {
      title: "Get email attachment",
      description: "Download a single attachment by message ID and attachment ID. Text-like files are returned decoded as text; binary files as base64.",
      inputSchema: {
        id: z.string().describe("Message ID."),
        attachmentId: z.string().describe("Attachment ID (from list_attachments)."),
        partId: z.string().optional().describe("Stable part ID (from list_attachments); preferred over attachmentId for lookup."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, attachmentId, partId, account }) =>
      withClient(account, (client) => getGmailAttachment(client, { id, attachmentId, partId }))
  );

  server.registerTool(
    "google_gmail_drafts_create",
    {
      title: "Create email draft",
      description: "Create a draft email (not sent).",
      inputSchema: {
        to: z.union([z.string(), z.array(z.string())]).describe("Recipient email(s)."),
        subject: z.string().describe("Subject line."),
        body: z.string().describe("Message body."),
        cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipient(s)."),
        bcc: z.union([z.string(), z.array(z.string())]).optional().describe("BCC recipient(s)."),
        bodyType: z.enum(["text", "html"]).optional().describe("Body format (default text)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ to, subject, body, cc, bcc, bodyType, account }) =>
      withClient(account, (client) => createGmailDraft(client, { to, subject, body, cc, bcc, bodyType }))
  );

  server.registerTool(
    "google_gmail_drafts_list",
    {
      title: "List email drafts",
      description: "List draft emails.",
      inputSchema: {
        maxResults: z.number().min(1).max(100).optional().describe("Max drafts (default 25)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ maxResults, account }) => withClient(account, (client) => listGmailDrafts(client, { maxResults }))
  );

  server.registerTool(
    "google_gmail_drafts_get",
    {
      title: "Get email draft",
      description: "Fetch a single draft with parsed headers and body.",
      inputSchema: {
        id: z.string().describe("Draft ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => withClient(account, (client) => getGmailDraft(client, { id }))
  );

  server.registerTool(
    "google_gmail_drafts_send",
    {
      title: "Send email draft",
      description: "Send an existing draft email.",
      inputSchema: {
        id: z.string().describe("Draft ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => withClient(account, (client) => sendGmailDraft(client, { id }))
  );

  server.registerTool(
    "google_gmail_drafts_delete",
    {
      title: "Delete email draft",
      description: "Delete a draft email.",
      inputSchema: {
        id: z.string().describe("Draft ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => {
      try {
        const client = await authManager.getClient(account);
        return ok(await deleteGmailDraft(client, { id }));
      } catch (error) {
        return err(error);
      }
    }
  );

  server.registerTool(
    "google_gmail_labels_list",
    {
      title: "List email labels",
      description: "List all Gmail labels.",
      inputSchema: {
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ account }) => withClient(account, (client) => listGmailLabels(client))
  );

  server.registerTool(
    "google_gmail_labels_create",
    {
      title: "Create email label",
      description: "Create a custom Gmail label.",
      inputSchema: {
        name: z.string().describe("Label name."),
        messageListVisibility: z.string().optional().describe("e.g. show or hide."),
        labelListVisibility: z.string().optional().describe("e.g. labelShow or labelHide."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ name, messageListVisibility, labelListVisibility, account }) =>
      withClient(account, (client) => createGmailLabel(client, { name, messageListVisibility, labelListVisibility }))
  );

  server.registerTool(
    "google_gmail_labels_delete",
    {
      title: "Delete email label",
      description: "Delete a Gmail label.",
      inputSchema: {
        id: z.string().describe("Label ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => {
      try {
        const client = await authManager.getClient(account);
        return ok(await deleteGmailLabel(client, { id }));
      } catch (error) {
        return err(error);
      }
    }
  );

  server.registerTool(
    "google_gmail_trash",
    {
      title: "Trash email",
      description: "Move a message to trash.",
      inputSchema: {
        id: z.string().describe("Message ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => withClient(account, (client) => trashGmailMessage(client, { id }))
  );

  server.registerTool(
    "google_gmail_untrash",
    {
      title: "Restore email from trash",
      description: "Restore a message from trash.",
      inputSchema: {
        id: z.string().describe("Message ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => withClient(account, (client) => untrashGmailMessage(client, { id }))
  );

  server.registerTool(
    "google_gmail_delete",
    {
      title: "Delete email permanently",
      description: "Permanently delete a message (irreversible).",
      inputSchema: {
        id: z.string().describe("Message ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => {
      try {
        const client = await authManager.getClient(account);
        return ok(await deleteGmailMessage(client, { id }));
      } catch (error) {
        return err(error);
      }
    }
  );

  // ---- Calendar -----------------------------------------------------------
  server.registerTool(
    "google_calendar_list_calendars",
    {
      title: "List calendars",
      description: "List calendars the account can access.",
      inputSchema: {
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ account }) => withClient(account, (client) => listCalendars(client))
  );

  server.registerTool(
    "google_calendar_list_events",
    {
      title: "List calendar events",
      description: "List upcoming events in a calendar, optionally filtered by time range or query.",
      inputSchema: {
        timeMin: z.string().optional().describe("Start of range (ISO 8601, default now)."),
        timeMax: z.string().optional().describe("End of range (ISO 8601)."),
        maxResults: z.number().min(1).max(250).optional().describe("Max events (default 25)."),
        q: z.string().optional().describe("Free-text search (e.g. meeting)."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ timeMin, timeMax, maxResults, q, calendarId, account }) =>
      withClient(account, (client) => listEvents(client, { timeMin, timeMax, maxResults, q, calendarId }))
  );

  server.registerTool(
    "google_calendar_create_event",
    {
      title: "Create calendar event",
      description: "Create a timed or all-day event. All-day events use YYYY-MM-DD dates.",
      inputSchema: {
        summary: z.string().describe("Event title."),
        start: z.string().describe("Start: RFC3339 datetime or YYYY-MM-DD for all-day."),
        end: z.string().describe("End: RFC3339 datetime or YYYY-MM-DD (exclusive) for all-day."),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string().email()).optional().describe("Attendee emails."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ summary, start, end, description, location, attendees, calendarId, account }) =>
      withClient(account, (client) => createEvent(client, { summary, start, end, description, location, attendees, calendarId }))
  );

  server.registerTool(
    "google_calendar_create_meet",
    {
      title: "Create event with Google Meet",
      description: "Create a calendar event with an attached Google Meet link.",
      inputSchema: {
        summary: z.string().describe("Meeting title."),
        start: z.string().describe("Start RFC3339 datetime."),
        end: z.string().describe("End RFC3339 datetime."),
        description: z.string().optional(),
        attendees: z.array(z.string().email()).optional().describe("Attendee emails."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ summary, start, end, description, attendees, calendarId, account }) =>
      withClient(account, (client) => createMeetLink(client, { summary, start, end, description, attendees, calendarId }))
  );

  server.registerTool(
    "google_calendar_get_event",
    {
      title: "Get calendar event",
      description: "Fetch a single event by ID.",
      inputSchema: {
        eventId: z.string().describe("Event ID."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ eventId, calendarId, account }) => withClient(account, (client) => getEvent(client, { eventId, calendarId }))
  );

  server.registerTool(
    "google_calendar_update_event",
    {
      title: "Update calendar event",
      description: "Update fields of an existing event (partial update).",
      inputSchema: {
        eventId: z.string().describe("Event ID."),
        summary: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        start: z.string().optional().describe("New start RFC3339 datetime."),
        end: z.string().optional().describe("New end RFC3339 datetime."),
        attendees: z.array(z.string().email()).optional().describe("Full attendee list."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ eventId, summary, description, location, start, end, attendees, calendarId, account }) =>
      withClient(account, (client) => updateEvent(client, { eventId, summary, description, location, start, end, attendees, calendarId }))
  );

  server.registerTool(
    "google_calendar_delete_event",
    {
      title: "Delete calendar event",
      description: "Delete an event by ID.",
      inputSchema: {
        eventId: z.string().describe("Event ID."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ eventId, calendarId, account }) => {
      try {
        const client = await authManager.getClient(account);
        await deleteEvent(client, { eventId, calendarId });
        return ok({ status: "deleted", eventId });
      } catch (error) {
        return err(error);
      }
    }
  );

  // ---- Drive --------------------------------------------------------------
  server.registerTool(
    "google_drive_list",
    {
      title: "List Drive files",
      description: "List files in Drive, newest first, with an optional query.",
      inputSchema: {
        query: z.string().optional().describe("Drive query (e.g. 'name contains \"report\"')."),
        pageSize: z.number().min(1).max(100).optional().describe("Max files (default 25)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ query, pageSize, account }) => withClient(account, (client) => listDriveFiles(client, { query, pageSize }))
  );

  server.registerTool(
    "google_drive_get",
    {
      title: "Get Drive file",
      description: "Get metadata for a single file by ID.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, account }) => withClient(account, (client) => getDriveFile(client, { fileId }))
  );

  server.registerTool(
    "google_drive_upload",
    {
      title: "Create/upload Drive file",
      description: "Create a file in Drive, optionally with text content (blank Google-native file if omitted).",
      inputSchema: {
        name: z.string().describe("File name."),
        mimeType: z.string().describe("MIME type (e.g. text/plain, application/vnd.google-apps.document)."),
        content: z.string().optional().describe("Text content to upload."),
        parentFolderId: z.string().optional().describe("Parent folder ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ name, mimeType, content, parentFolderId, account }) =>
      withClient(account, (client) => uploadDriveFile(client, { name, mimeType, content, parentFolderId }))
  );

  server.registerTool(
    "google_drive_update",
    {
      title: "Update Drive file",
      description: "Rename a file and/or replace its content.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        name: z.string().optional().describe("New name."),
        mimeType: z.string().optional(),
        content: z.string().optional().describe("New content."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, name, mimeType, content, account }) =>
      withClient(account, (client) => updateDriveFile(client, { fileId, name, mimeType, content }))
  );

  server.registerTool(
    "google_drive_delete",
    {
      title: "Delete Drive file",
      description: "Permanently delete a file from Drive.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, account }) => {
      try {
        const client = await authManager.getClient(account);
        await deleteDriveFile(client, { fileId });
        return ok({ status: "deleted", fileId });
      } catch (error) {
        return err(error);
      }
    }
  );

  server.registerTool(
    "google_drive_share",
    {
      title: "Share Drive file",
      description: "Share a file with a user by email and role.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        email: z.string().email().describe("Recipient email."),
        role: z.enum(["reader", "writer", "commenter"]).describe("Access role."),
        sendNotificationEmail: z.boolean().optional().describe("Email the recipient (default true)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, email, role, sendNotificationEmail, account }) =>
      withClient(account, (client) => shareDriveFile(client, { fileId, email, role, sendNotificationEmail }))
  );

  server.registerTool(
    "google_drive_download",
    {
      title: "Download Drive file",
      description: "Download a file's raw bytes (non-Google-native files). Text content returns decoded text; binary returns base64.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, account }) => withClient(account, (client) => downloadDriveFile(client, { fileId }))
  );

  server.registerTool(
    "google_drive_export",
    {
      title: "Export Drive file",
      description: "Export a Google-native file (Docs/Sheets/Slides/Drawings) to another format (e.g. application/pdf, text/plain, application/vnd.openxmlformats-officedocument.wordprocessingml.document).",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        mimeType: z.string().describe("Target MIME type (e.g. application/pdf)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, mimeType, account }) =>
      withClient(account, (client) => exportDriveFile(client, { fileId, mimeType }))
  );

  server.registerTool(
    "google_drive_create_folder",
    {
      title: "Create Drive folder",
      description: "Create a folder in Drive.",
      inputSchema: {
        name: z.string().describe("Folder name."),
        parentFolderId: z.string().optional().describe("Parent folder ID (root if omitted)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ name, parentFolderId, account }) =>
      withClient(account, (client) => createDriveFolder(client, { name, parentFolderId }))
  );

  server.registerTool(
    "google_drive_copy",
    {
      title: "Copy Drive file",
      description: "Copy a file, optionally with a new name.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        name: z.string().optional().describe("New name."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, name, account }) => withClient(account, (client) => copyDriveFile(client, { fileId, name }))
  );

  // ---- Contacts -----------------------------------------------------------
  server.registerTool(
    "google_contacts_list",
    {
      title: "List contacts",
      description: "List the account's contacts with names, emails and phones.",
      inputSchema: {
        pageSize: z.number().min(1).max(100).optional().describe("Max contacts (default 100)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ pageSize, account }) => withClient(account, (client) => listContacts(client, { pageSize }))
  );

  server.registerTool(
    "google_contacts_search",
    {
      title: "Search contacts",
      description: "Search contacts (including non-connected) by name, email or phone.",
      inputSchema: {
        query: z.string().describe("Search text."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ query, account }) => withClient(account, (client) => searchContacts(client, { query }))
  );

  server.registerTool(
    "google_contacts_create",
    {
      title: "Create contact",
      description: "Create a new contact with a name and optional email/phone.",
      inputSchema: {
        name: z.string().describe("Contact full name."),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ name, email, phone, account }) => withClient(account, (client) => createContact(client, { name, email, phone }))
  );

  // ---- Tasks --------------------------------------------------------------
  server.registerTool(
    "google_tasks_list_lists",
    {
      title: "List task lists",
      description: "List the account's Google Tasks lists.",
      inputSchema: {
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ account }) => withClient(account, (client) => listTaskLists(client))
  );

  server.registerTool(
    "google_tasks_list",
    {
      title: "List tasks",
      description: "List tasks in a task list (default list if not specified).",
      inputSchema: {
        tasklistId: z.string().optional().describe("Task list ID (default @default)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ tasklistId, account }) => withClient(account, (client) => listTasks(client, { tasklistId }))
  );

  server.registerTool(
    "google_tasks_create",
    {
      title: "Create task",
      description: "Create a task, optionally with notes and due date.",
      inputSchema: {
        title: z.string().describe("Task title."),
        notes: z.string().optional(),
        due: z.string().optional().describe("Due date (RFC3339, e.g. 2026-08-15T17:00:00Z)."),
        tasklistId: z.string().optional().describe("Task list ID (default @default)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, notes, due, tasklistId, account }) =>
      withClient(account, (client) => createTask(client, { title, notes, due, tasklistId }))
  );

  server.registerTool(
    "google_tasks_complete",
    {
      title: "Complete task",
      description: "Mark a task as completed.",
      inputSchema: {
        taskId: z.string().describe("Task ID."),
        tasklistId: z.string().optional().describe("Task list ID (default @default)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ taskId, tasklistId, account }) => withClient(account, (client) => completeTask(client, { taskId, tasklistId }))
  );

  server.registerTool(
    "google_tasks_delete",
    {
      title: "Delete task",
      description: "Delete a task.",
      inputSchema: {
        taskId: z.string().describe("Task ID."),
        tasklistId: z.string().optional().describe("Task list ID (default @default)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ taskId, tasklistId, account }) => {
      try {
        const client = await authManager.getClient(account);
        await deleteTask(client, { taskId, tasklistId });
        return ok({ status: "deleted", taskId });
      } catch (error) {
        return err(error);
      }
    }
  );

  // ---- Sheets --------------------------------------------------------------
  server.registerTool(
    "google_sheets_get",
    {
      title: "Get spreadsheet",
      description: "Get spreadsheet metadata and optionally cell values from a range.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID (from the URL)."),
        range: z.string().optional().describe("A1 range to also read values from, e.g. Sheet1!A1:B5."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, account }) =>
      withClient(account, (client) => getSpreadsheet(client, { spreadsheetId, range }))
  );

  server.registerTool(
    "google_sheets_read",
    {
      title: "Read spreadsheet range",
      description: "Read cell values from a range as rows of strings.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        range: z.string().describe("A1 notation, e.g. Sheet1!A1:C10."),
        majorDimension: z.enum(["ROWS", "COLUMNS"]).optional().describe("Read direction (default ROWS)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, majorDimension, account }) =>
      withClient(account, (client) => readSheetRange(client, { spreadsheetId, range, majorDimension }))
  );

  server.registerTool(
    "google_sheets_write",
    {
      title: "Write to spreadsheet",
      description: "Write rows of values starting at a range top-left cell (overwrites in place).",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        range: z.string().describe("A1 notation of the top-left cell, e.g. Sheet1!A1."),
        values: z.array(z.array(z.string())).describe("Rows of values to write."),
        valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().describe("How to interpret values (default USER_ENTERED)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, values, valueInputOption, account }) =>
      withClient(account, (client) => writeSheetRange(client, { spreadsheetId, range, values, valueInputOption }))
  );

  server.registerTool(
    "google_sheets_append",
    {
      title: "Append to spreadsheet",
      description: "Append rows below the existing data in a sheet.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        range: z.string().describe("A1 range of the table to append to, e.g. Sheet1!A1."),
        values: z.array(z.array(z.string())).describe("Rows of values to append."),
        valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().describe("How to interpret values (default USER_ENTERED)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, values, valueInputOption, account }) =>
      withClient(account, (client) => appendSheetRange(client, { spreadsheetId, range, values, valueInputOption }))
  );

  server.registerTool(
    "google_sheets_create",
    {
      title: "Create spreadsheet",
      description: "Create a new spreadsheet, optionally with pre-made sheet tabs.",
      inputSchema: {
        title: z.string().describe("Spreadsheet title."),
        sheets: z.array(z.string()).optional().describe("Sheet tab names to create."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, sheets, account }) => withClient(account, (client) => createSpreadsheet(client, { title, sheets }))
  );

  server.registerTool(
    "google_sheets_batch_update",
    {
      title: "Batch update spreadsheet",
      description: "Send raw Sheets batchUpdate requests (add/delete sheets, formatting, etc.).",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        requests: z.array(z.record(z.string(), z.any())).describe("Sheets API batchUpdate requests."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, requests, account }) =>
      withClient(account, (client) => batchUpdateSheet(client, { spreadsheetId, requests }))
  );

  // ---- Docs ---------------------------------------------------------------
  server.registerTool(
    "google_docs_get",
    {
      title: "Get document",
      description: "Get the full Google Docs document (structural JSON).",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, account }) => withClient(account, (client) => getDocument(client, { documentId }))
  );

  server.registerTool(
    "google_docs_read",
    {
      title: "Read document text",
      description: "Read a Google Docs document as plain text.",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, account }) => withClient(account, (client) => getDocumentText(client, { documentId }))
  );

  server.registerTool(
    "google_docs_create",
    {
      title: "Create document",
      description: "Create a new Google Docs document with a title.",
      inputSchema: {
        title: z.string().describe("Document title."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, account }) => withClient(account, (client) => createDocument(client, { title }))
  );

  server.registerTool(
    "google_docs_insert_text",
    {
      title: "Insert text in document",
      description: "Insert text into a document at an index or at the end.",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        text: z.string().describe("Text to insert."),
        index: z.number().int().min(0).optional().describe("Character index to insert at (default end of document)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, text, index, account }) =>
      withClient(account, (client) => insertText(client, { documentId, text, index }))
  );

  server.registerTool(
    "google_docs_replace_text",
    {
      title: "Replace text in document",
      description: "Replace all occurrences of a string in a document (template filling).",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        find: z.string().describe("Text to find (e.g. {{name}})."),
        replace: z.string().describe("Replacement text."),
        matchCase: z.boolean().optional().describe("Match case (default true)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, find, replace, matchCase, account }) =>
      withClient(account, (client) => replaceAllText(client, { documentId, find, replace, matchCase }))
  );

  server.registerTool(
    "google_docs_batch_update",
    {
      title: "Batch update document",
      description: "Send raw Docs batchUpdate requests (styles, tables, headers, etc.).",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        requests: z.array(z.record(z.string(), z.any())).describe("Docs API batchUpdate requests."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, requests, account }) =>
      withClient(account, (client) => batchUpdateDocument(client, { documentId, requests }))
  );

  // ---- Slides -------------------------------------------------------------
  server.registerTool(
    "google_slides_get",
    {
      title: "Get presentation",
      description: "Get a Google Slides presentation (structural JSON).",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, account }) => withClient(account, (client) => getPresentation(client, { presentationId }))
  );

  server.registerTool(
    "google_slides_create",
    {
      title: "Create presentation",
      description: "Create a new Google Slides presentation with a title.",
      inputSchema: {
        title: z.string().describe("Presentation title."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, account }) => withClient(account, (client) => createPresentation(client, { title }))
  );

  server.registerTool(
    "google_slides_replace_text",
    {
      title: "Replace text in presentation",
      description: "Replace all occurrences of a string across a presentation (template filling).",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        find: z.string().describe("Text to find (e.g. {{name}})."),
        replace: z.string().describe("Replacement text."),
        matchCase: z.boolean().optional().describe("Match case (default true)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, find, replace, matchCase, account }) =>
      withClient(account, (client) => replaceSlidesText(client, { presentationId, find, replace, matchCase }))
  );

  server.registerTool(
    "google_slides_add_slide",
    {
      title: "Add slide",
      description: "Add a blank slide to a presentation.",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, account }) => withClient(account, (client) => createSlide(client, { presentationId }))
  );

  server.registerTool(
    "google_slides_delete_slide",
    {
      title: "Delete slide",
      description: "Delete a slide by object ID.",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        slideObjectId: z.string().describe("Slide object ID to delete."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, slideObjectId, account }) =>
      withClient(account, (client) => deleteSlide(client, { presentationId, slideObjectId }))
  );

  server.registerTool(
    "google_slides_get_page",
    {
      title: "Get slide page",
      description: "Get the contents of a single slide page by object ID.",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        pageObjectId: z.string().describe("Slide page object ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, pageObjectId, account }) =>
      withClient(account, (client) => getSlidePage(client, { presentationId, pageObjectId }))
  );

  server.registerTool(
    "google_slides_batch_update",
    {
      title: "Batch update presentation",
      description: "Send raw Slides batchUpdate requests (create textboxes, shapes, images, style elements, etc.).",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        requests: z.array(z.any()).describe("Slides API batchUpdate requests array."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, requests, account }) =>
      withClient(account, (client) => batchUpdatePresentation(client, { presentationId, requests }))
  );

  // ---- YouTube ------------------------------------------------------------
  server.registerTool(
    "google_youtube_search",
    {
      title: "Search YouTube videos",
      description: "Search YouTube for videos and return titles, IDs and channels.",
      inputSchema: {
        query: z.string().describe("Search query."),
        maxResults: z.number().min(1).max(50).optional().describe("Max results (default 10)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ query, maxResults, account }) => withClient(account, (client) => searchVideos(client, { query, maxResults }))
  );

  server.registerTool(
    "google_youtube_get_video",
    {
      title: "Get YouTube video details",
      description: "Get details, statistics and content details for a video.",
      inputSchema: {
        videoId: z.string().describe("YouTube video ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ videoId, account }) => withClient(account, (client) => getVideo(client, { videoId }))
  );

  server.registerTool(
    "google_youtube_my_videos",
    {
      title: "List my YouTube videos",
      description: "List the user's uploaded videos.",
      inputSchema: {
        maxResults: z.number().min(1).max(50).optional().describe("Max videos (default 25)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ maxResults, account }) => withClient(account, (client) => getMyVideos(client, { maxResults }))
  );

  server.registerTool(
    "google_youtube_list_playlists",
    {
      title: "List my playlists",
      description: "List the user's YouTube playlists.",
      inputSchema: {
        maxResults: z.number().min(1).max(50).optional().describe("Max playlists (default 25)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ maxResults, account }) => withClient(account, (client) => listPlaylists(client, { maxResults }))
  );

  server.registerTool(
    "google_youtube_create_playlist",
    {
      title: "Create YouTube playlist",
      description: "Create a private playlist for the user.",
      inputSchema: {
        title: z.string().describe("Playlist title."),
        description: z.string().optional().describe("Playlist description."),
        privacyStatus: z.enum(["private", "public", "unlisted"]).optional().describe("Privacy (default private)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, description, privacyStatus, account }) =>
      withClient(account, (client) => createPlaylist(client, { title, description, privacyStatus }))
  );

  server.registerTool(
    "google_youtube_delete_playlist",
    {
      title: "Delete YouTube playlist",
      description: "Delete a playlist by ID.",
      inputSchema: {
        playlistId: z.string().describe("Playlist ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ playlistId, account }) => withClient(account, (client) => deletePlaylist(client, { playlistId }))
  );

  server.registerTool(
    "google_youtube_add_to_playlist",
    {
      title: "Add video to playlist",
      description: "Add a video to a playlist.",
      inputSchema: {
        playlistId: z.string().describe("Playlist ID."),
        videoId: z.string().describe("Video ID to add."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ playlistId, videoId, account }) =>
      withClient(account, (client) => addVideoToPlaylist(client, { playlistId, videoId }))
  );

  server.registerTool(
    "google_youtube_subscriptions",
    {
      title: "List channel subscriptions",
      description: "List the channels the user subscribes to.",
      inputSchema: {
        maxResults: z.number().min(1).max(50).optional().describe("Max results (default 50)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ maxResults, account }) => withClient(account, (client) => listSubscriptions(client, { maxResults }))
  );

  // ---- Forms --------------------------------------------------------------
  server.registerTool(
    "google_forms_get",
    {
      title: "Get form",
      description: "Get a Google Form's structure and questions.",
      inputSchema: {
        formId: z.string().describe("Form ID (from the URL)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, account }) => withClient(account, (client) => getForm(client, { formId }))
  );

  server.registerTool(
    "google_forms_responses",
    {
      title: "Get form responses",
      description: "List responses submitted to a form.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        pageSize: z.number().min(1).max(100).optional().describe("Max responses (default 100)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, pageSize, account }) => withClient(account, (client) => getFormResponses(client, { formId, pageSize }))
  );

  server.registerTool(
    "google_forms_create",
    {
      title: "Create form",
      description: "Create a new Google Form with a title.",
      inputSchema: {
        title: z.string().describe("Form title."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, account }) => withClient(account, (client) => createForm(client, { title }))
  );

  server.registerTool(
    "google_forms_add_question",
    {
      title: "Add form question",
      description: "Add a text or multiple-choice question to a form.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        title: z.string().describe("Question text."),
        description: z.string().optional().describe("Optional help text."),
        type: z.enum(["text", "multiple_choice"]).optional().describe("Question type (default text)."),
        options: z.array(z.string()).optional().describe("Choices for multiple_choice."),
        required: z.boolean().optional().describe("Whether the question is required (default false)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, title, description, type, options, required, account }) =>
      withClient(account, (client) => addQuestion(client, { formId, title, description, type, options, required }))
  );
}

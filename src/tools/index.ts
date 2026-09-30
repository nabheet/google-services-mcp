import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Auth } from "googleapis";
import { z } from "zod";
import { authManager } from "../auth/manager.js";
import {
  createCalendar,
  createEvent,
  createMeetLink,
  deleteCalendar,
  deleteEvent,
  getEvent,
  listCalendars,
  listEvents,
  queryFreeBusy,
  respondToEvent,
  updateCalendar,
  updateEvent,
} from "../services/calendar.js";
import {
  completeTask,
  createContact,
  createTask,
  createTaskList,
  deleteContact,
  deleteTask,
  deleteTaskList,
  getContact,
  listContacts,
  listTaskLists,
  listTasks,
  searchContacts,
  updateContact,
  updateTask,
  updateTaskList,
} from "../services/contacts-tasks.js";
import {
  batchUpdateDocument,
  createDocument,
  deleteRange,
  getDocument,
  getDocumentText,
  insertInlineImage,
  insertTable,
  insertText,
  replaceAllText,
} from "../services/docs.js";
import {
  copyDriveFile,
  createDriveFolder,
  deleteDriveFile,
  deleteDrivePermission,
  downloadDriveFile,
  exportDriveFile,
  getDriveFile,
  listDriveFiles,
  listDrivePermissions,
  moveDriveFile,
  restoreDriveFile,
  shareDriveFile,
  trashDriveFile,
  updateDriveFile,
  uploadDriveFile,
} from "../services/drive.js";
import {
  addQuestion,
  createForm,
  deleteForm,
  deleteFormQuestion,
  exportFormResponsesToSheet,
  getForm,
  getFormResponses,
  moveFormQuestion,
  renameForm,
  updateFormQuestion,
} from "../services/forms.js";
import {
  createGmailDraft,
  createGmailFilter,
  createGmailLabel,
  createSendAs,
  deleteGmailDraft,
  deleteGmailFilter,
  deleteGmailLabel,
  deleteGmailMessage,
  getGmailAttachment,
  getGmailDraft,
  getGmailMessage,
  getGmailThread,
  getVacationSettings,
  listGmailAttachments,
  listGmailDrafts,
  listGmailFilters,
  listGmailLabels,
  listGmailMessages,
  listGmailThreads,
  listSendAs,
  modifyGmailMessage,
  replyGmail,
  sendGmail,
  sendGmailDraft,
  trashGmailMessage,
  untrashGmailMessage,
  updateGmailLabel,
  updateVacationSettings,
} from "../services/gmail.js";
import {
  addSheet,
  appendSheetRange,
  batchUpdateSheet,
  createSpreadsheet,
  deleteRows,
  deleteSheet,
  getNamedRanges,
  getSpreadsheet,
  insertRows,
  readSheetRange,
  renameSheet,
  setNamedRange,
  writeSheetRange,
} from "../services/sheets.js";
import {
  batchUpdatePresentation,
  createImage,
  createPresentation,
  createSlide,
  createTextbox,
  deleteSlide,
  duplicateSlide,
  getPresentation,
  getSlidePage,
  moveSlide,
  replaceAllText as replaceSlidesText,
} from "../services/slides.js";
import {
  addVideoToPlaylist,
  createPlaylist,
  deletePlaylist,
  getMyVideos,
  getVideo,
  insertComment,
  listComments,
  listPlaylists,
  listSubscriptions,
  markCommentAsSpam,
  removeVideoFromPlaylist,
  searchVideos,
  setCommentModeration,
  updateVideo,
  uploadVideo,
} from "../services/youtube.js";
import { err, ok } from "../util/result.js";

/** Wrap a service call that resolves its own auth client. */
async function withClient<T>(
  account: string | undefined,
  fn: (client: Auth.OAuth2Client) => Promise<T>,
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
      description:
        "Start the OAuth consent flow to connect a new Google account. Opens a browser for sign-in.",
      inputSchema: {
        name: z.string().describe("Nickname for the account (e.g. personal, work)."),
        openBrowser: z
          .boolean()
          .optional()
          .describe("Open a browser automatically (default true)."),
      },
    },
    async ({ name, openBrowser }) => {
      try {
        const account = await authManager.addAccount(name, { openBrowser });
        return ok({ status: "added", name: account.name, email: account.email });
      } catch (error) {
        return err(error);
      }
    },
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
    },
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
    },
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
    },
  );

  server.registerTool(
    "google_account_status",
    {
      title: "Google services status",
      description:
        "Show credential configuration, data directory, connected accounts and token health.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await authManager.getStatus());
      } catch (error) {
        return err(error);
      }
    },
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
        cc: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe("CC recipient(s)."),
        bcc: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe("BCC recipient(s)."),
        bodyType: z.enum(["text", "html"]).optional().describe("Body format (default text)."),
        attachments: z
          .array(
            z.object({
              path: z.string().describe("Local filesystem path of the file to attach."),
              filename: z
                .string()
                .optional()
                .describe(
                  "Attachment filename shown to recipients (defaults to the basename of path).",
                ),
              mimeType: z
                .string()
                .optional()
                .describe("MIME type override (defaults to a guess from the filename)."),
              disposition: z
                .enum(["attachment", "inline"])
                .optional()
                .describe(
                  "How the part is presented (default attachment; inline embeds it in the body).",
                ),
              cid: z
                .string()
                .optional()
                .describe("Content-ID for inline parts so HTML can reference them as cid:<cid>."),
            }),
          )
          .optional()
          .describe("Local files to attach to the email."),
        driveFileIds: z
          .array(z.string())
          .optional()
          .describe(
            "Drive file IDs to attach by reference (downloaded under the Gmail size limit).",
          ),
        from: z.string().optional().describe("Send-as alias or address to set as the From header."),
        replyTo: z.string().optional().describe("Address to set as the Reply-To header."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      to,
      subject,
      body,
      cc,
      bcc,
      bodyType,
      attachments,
      driveFileIds,
      from,
      replyTo,
      account,
    }) =>
      withClient(account, (client) =>
        sendGmail(client, {
          to,
          subject,
          body,
          cc,
          bcc,
          bodyType,
          attachments,
          driveFileIds,
          from,
          replyTo,
        }),
      ),
  );

  server.registerTool(
    "google_gmail_list",
    {
      title: "List emails",
      description:
        "List messages from the inbox, newest first, with an optional Gmail search query.",
      inputSchema: {
        query: z.string().optional().describe("Gmail search query (e.g. from:bob, newer_than:2d)."),
        maxResults: z.number().min(1).max(100).optional().describe("Max messages (default 25)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ query, maxResults, account }) =>
      withClient(account, (client) => listGmailMessages(client, { query, maxResults })),
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
    async ({ id, account }) => withClient(account, (client) => getGmailMessage(client, { id })),
  );

  server.registerTool(
    "google_gmail_threads_list",
    {
      title: "List email threads",
      description: "List conversation threads, newest first, with an optional Gmail search query.",
      inputSchema: {
        query: z.string().optional().describe("Gmail search query (e.g. from:bob, newer_than:2d)."),
        maxResults: z.number().min(1).max(100).optional().describe("Max threads (default 25)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ query, maxResults, account }) =>
      withClient(account, (client) => listGmailThreads(client, { query, maxResults })),
  );

  server.registerTool(
    "google_gmail_threads_get",
    {
      title: "Read an email thread",
      description:
        "Fetch a full conversation thread with every message parsed (headers, body, attachments).",
      inputSchema: {
        id: z.string().describe("Thread ID."),
        format: z
          .enum(["full", "metadata", "minimal"])
          .optional()
          .describe("Payload format (default full)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, format, account }) =>
      withClient(account, (client) => getGmailThread(client, { id, format })),
  );

  server.registerTool(
    "google_gmail_modify",
    {
      title: "Modify email labels",
      description: "Add or remove labels on a message (e.g. mark read/unread, star, archive).",
      inputSchema: {
        id: z.string().describe("Message ID."),
        addLabels: z
          .array(z.string())
          .optional()
          .describe("Labels to add (e.g. STARRED, INBOX, TRASH)."),
        removeLabels: z.array(z.string()).optional().describe("Labels to remove (e.g. UNREAD)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, addLabels, removeLabels, account }) =>
      withClient(account, (client) => modifyGmailMessage(client, { id, addLabels, removeLabels })),
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
        attachments: z
          .array(
            z.object({
              path: z.string().describe("Local filesystem path of the file to attach."),
              filename: z
                .string()
                .optional()
                .describe(
                  "Attachment filename shown to recipients (defaults to the basename of path).",
                ),
              mimeType: z
                .string()
                .optional()
                .describe("MIME type override (defaults to a guess from the filename)."),
              disposition: z
                .enum(["attachment", "inline"])
                .optional()
                .describe(
                  "How the part is presented (default attachment; inline embeds it in the body).",
                ),
              cid: z
                .string()
                .optional()
                .describe("Content-ID for inline parts so HTML can reference them as cid:<cid>."),
            }),
          )
          .optional()
          .describe("Local files to attach to the reply."),
        driveFileIds: z
          .array(z.string())
          .optional()
          .describe(
            "Drive file IDs to attach by reference (downloaded under the Gmail size limit).",
          ),
        from: z.string().optional().describe("Send-as alias or address to set as the From header."),
        replyTo: z.string().optional().describe("Address to set as the Reply-To header."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      threadId,
      messageId,
      body,
      bodyType,
      attachments,
      driveFileIds,
      from,
      replyTo,
      account,
    }) =>
      withClient(account, (client) =>
        replyGmail(client, {
          threadId,
          messageId,
          body,
          bodyType,
          attachments,
          driveFileIds,
          from,
          replyTo,
        }),
      ),
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
    async ({ id, account }) =>
      withClient(account, (client) => listGmailAttachments(client, { id })),
  );

  server.registerTool(
    "google_gmail_get_attachment",
    {
      title: "Get email attachment",
      description:
        "Download a single attachment by message ID and attachment ID. Text-like files are returned decoded as text; binary files as base64.",
      inputSchema: {
        id: z.string().describe("Message ID."),
        attachmentId: z.string().describe("Attachment ID (from list_attachments)."),
        partId: z
          .string()
          .optional()
          .describe(
            "Stable part ID (from list_attachments); preferred over attachmentId for lookup.",
          ),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, attachmentId, partId, account }) =>
      withClient(account, (client) => getGmailAttachment(client, { id, attachmentId, partId })),
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
        cc: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe("CC recipient(s)."),
        bcc: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe("BCC recipient(s)."),
        bodyType: z.enum(["text", "html"]).optional().describe("Body format (default text)."),
        attachments: z
          .array(
            z.object({
              path: z.string().describe("Local filesystem path of the file to attach."),
              filename: z
                .string()
                .optional()
                .describe(
                  "Attachment filename shown to recipients (defaults to the basename of path).",
                ),
              mimeType: z
                .string()
                .optional()
                .describe("MIME type override (defaults to a guess from the filename)."),
              disposition: z
                .enum(["attachment", "inline"])
                .optional()
                .describe(
                  "How the part is presented (default attachment; inline embeds it in the body).",
                ),
              cid: z
                .string()
                .optional()
                .describe("Content-ID for inline parts so HTML can reference them as cid:<cid>."),
            }),
          )
          .optional()
          .describe("Local files to attach to the draft."),
        driveFileIds: z
          .array(z.string())
          .optional()
          .describe(
            "Drive file IDs to attach by reference (downloaded under the Gmail size limit).",
          ),
        from: z.string().optional().describe("Send-as alias or address to set as the From header."),
        replyTo: z.string().optional().describe("Address to set as the Reply-To header."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      to,
      subject,
      body,
      cc,
      bcc,
      bodyType,
      attachments,
      driveFileIds,
      from,
      replyTo,
      account,
    }) =>
      withClient(account, (client) =>
        createGmailDraft(client, {
          to,
          subject,
          body,
          cc,
          bcc,
          bodyType,
          attachments,
          driveFileIds,
          from,
          replyTo,
        }),
      ),
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
    async ({ maxResults, account }) =>
      withClient(account, (client) => listGmailDrafts(client, { maxResults })),
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
    async ({ id, account }) => withClient(account, (client) => getGmailDraft(client, { id })),
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
    async ({ id, account }) => withClient(account, (client) => sendGmailDraft(client, { id })),
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
    },
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
    async ({ account }) => withClient(account, (client) => listGmailLabels(client)),
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
      withClient(account, (client) =>
        createGmailLabel(client, { name, messageListVisibility, labelListVisibility }),
      ),
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
    },
  );

  server.registerTool(
    "google_gmail_labels_update",
    {
      title: "Update email label",
      description: "Update a Gmail label's name or visibility (partial).",
      inputSchema: {
        id: z.string().describe("Label ID."),
        name: z.string().optional().describe("New label name."),
        messageListVisibility: z.string().optional().describe("e.g. show or hide."),
        labelListVisibility: z.string().optional().describe("e.g. labelShow or labelHide."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, name, messageListVisibility, labelListVisibility, account }) =>
      withClient(account, (client) =>
        updateGmailLabel(client, { id, name, messageListVisibility, labelListVisibility }),
      ),
  );

  server.registerTool(
    "google_gmail_vacation_get",
    {
      title: "Get vacation responder",
      description: "Get the Gmail vacation (out-of-office) responder settings.",
      inputSchema: {
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ account }) => withClient(account, (client) => getVacationSettings(client)),
  );

  server.registerTool(
    "google_gmail_vacation_update",
    {
      title: "Update vacation responder",
      description: "Update the Gmail vacation (out-of-office) responder settings.",
      inputSchema: {
        enableAutoReply: z.boolean().optional().describe("Turn the auto-reply on/off."),
        responseSubject: z.string().optional().describe("Subject of the auto-reply."),
        responseBodyPlainText: z.string().optional().describe("Plain-text body of the auto-reply."),
        responseBodyHtml: z.string().optional().describe("HTML body of the auto-reply."),
        startTime: z.string().optional().describe("Start time as ms epoch string."),
        endTime: z.string().optional().describe("End time as ms epoch string."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      enableAutoReply,
      responseSubject,
      responseBodyPlainText,
      responseBodyHtml,
      startTime,
      endTime,
      account,
    }) =>
      withClient(account, (client) =>
        updateVacationSettings(client, {
          enableAutoReply,
          responseSubject,
          responseBodyPlainText,
          responseBodyHtml,
          startTime,
          endTime,
        }),
      ),
  );

  server.registerTool(
    "google_gmail_sendas_list",
    {
      title: "List send-as aliases",
      description: "List Gmail send-as aliases.",
      inputSchema: {
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ account }) => withClient(account, (client) => listSendAs(client)),
  );

  server.registerTool(
    "google_gmail_sendas_create",
    {
      title: "Create send-as alias",
      description: "Create a Gmail send-as alias (subject to domain/verification rules).",
      inputSchema: {
        sendAsEmail: z.string().describe("Email address for the alias."),
        displayName: z.string().optional(),
        isDefault: z.boolean().optional(),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ sendAsEmail, displayName, isDefault, account }) =>
      withClient(account, (client) =>
        createSendAs(client, { sendAsEmail, displayName, isDefault }),
      ),
  );

  server.registerTool(
    "google_gmail_filters_list",
    {
      title: "List Gmail filters",
      description: "List Gmail filters (auto-archive/apply rules).",
      inputSchema: {
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ account }) => withClient(account, (client) => listGmailFilters(client)),
  );

  server.registerTool(
    "google_gmail_filters_create",
    {
      title: "Create Gmail filter",
      description: "Create a Gmail filter with criteria and action (e.g. auto-archive).",
      inputSchema: {
        criteria: z
          .object({
            from: z.string().optional(),
            to: z.string().optional(),
            subject: z.string().optional(),
            query: z.string().optional(),
            negatedQuery: z.string().optional(),
            hasAttachment: z.boolean().optional(),
            excludeChats: z.boolean().optional(),
          })
          .optional()
          .describe("Match criteria."),
        action: z
          .object({
            addLabelIds: z.array(z.string()).optional(),
            removeLabelIds: z.array(z.string()).optional(),
            forward: z.string().optional(),
          })
          .optional()
          .describe("Action to apply when matched (e.g. markAsRead via removeLabelIds UNREAD)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ criteria, action, account }) =>
      withClient(account, (client) => createGmailFilter(client, { criteria, action })),
  );

  server.registerTool(
    "google_gmail_filters_delete",
    {
      title: "Delete Gmail filter",
      description: "Delete a Gmail filter by ID.",
      inputSchema: {
        id: z.string().describe("Filter ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ id, account }) => {
      try {
        const client = await authManager.getClient(account);
        return ok(await deleteGmailFilter(client, { id }));
      } catch (error) {
        return err(error);
      }
    },
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
    async ({ id, account }) => withClient(account, (client) => trashGmailMessage(client, { id })),
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
    async ({ id, account }) => withClient(account, (client) => untrashGmailMessage(client, { id })),
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
    },
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
    async ({ account }) => withClient(account, (client) => listCalendars(client)),
  );

  server.registerTool(
    "google_calendar_list_events",
    {
      title: "List calendar events",
      description:
        "List upcoming events in a calendar, optionally filtered by time range or query.",
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
      withClient(account, (client) =>
        listEvents(client, { timeMin, timeMax, maxResults, q, calendarId }),
      ),
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
        timeZone: z
          .string()
          .optional()
          .describe("IANA time zone, e.g. America/Denver. Required for recurring timed events."),
        recurrence: z
          .array(z.string())
          .optional()
          .describe('RRULE strings, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TH"].'),
        reminderMethod: z.enum(["email", "popup"]).optional().describe("Reminder delivery method."),
        reminderMinutes: z.number().int().positive().optional().describe("Minutes before event."),
        remindersUseDefault: z
          .boolean()
          .optional()
          .describe("Use calendar default reminders instead of overrides."),
        sendUpdates: z
          .enum(["all", "externalOnly", "none"])
          .optional()
          .describe("Control attendee notification emails."),
        transparency: z
          .enum(["opaque", "transparent"])
          .optional()
          .describe("Show as busy (opaque) or free (transparent)."),
        colorId: z.string().optional().describe("Event color ID (1-11)."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      summary,
      start,
      end,
      description,
      location,
      attendees,
      timeZone,
      recurrence,
      reminderMethod,
      reminderMinutes,
      remindersUseDefault,
      sendUpdates,
      transparency,
      colorId,
      calendarId,
      account,
    }) =>
      withClient(account, (client) =>
        createEvent(client, {
          summary,
          start,
          end,
          description,
          location,
          attendees,
          timeZone,
          recurrence,
          reminderMethod,
          reminderMinutes,
          remindersUseDefault,
          sendUpdates,
          transparency,
          colorId,
          calendarId,
        }),
      ),
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
      withClient(account, (client) =>
        createMeetLink(client, { summary, start, end, description, attendees, calendarId }),
      ),
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
    async ({ eventId, calendarId, account }) =>
      withClient(account, (client) => getEvent(client, { eventId, calendarId })),
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
        timeZone: z
          .string()
          .optional()
          .describe(
            "IANA time zone, e.g. America/Denver. Required when updating to recurring timed events.",
          ),
        recurrence: z
          .array(z.string())
          .optional()
          .describe('RRULE strings, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TH"].'),
        reminderMethod: z.enum(["email", "popup"]).optional().describe("Reminder delivery method."),
        reminderMinutes: z.number().int().positive().optional().describe("Minutes before event."),
        remindersUseDefault: z
          .boolean()
          .optional()
          .describe("Use calendar default reminders instead of overrides."),
        sendUpdates: z
          .enum(["all", "externalOnly", "none"])
          .optional()
          .describe("Control attendee notification emails."),
        transparency: z
          .enum(["opaque", "transparent"])
          .optional()
          .describe("Show as busy (opaque) or free (transparent)."),
        colorId: z.string().optional().describe("Event color ID (1-11)."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      eventId,
      summary,
      description,
      location,
      start,
      end,
      attendees,
      timeZone,
      recurrence,
      reminderMethod,
      reminderMinutes,
      remindersUseDefault,
      sendUpdates,
      transparency,
      colorId,
      calendarId,
      account,
    }) =>
      withClient(account, (client) =>
        updateEvent(client, {
          eventId,
          summary,
          description,
          location,
          start,
          end,
          attendees,
          timeZone,
          recurrence,
          reminderMethod,
          reminderMinutes,
          remindersUseDefault,
          sendUpdates,
          transparency,
          colorId,
          calendarId,
        }),
      ),
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
    },
  );

  server.registerTool(
    "google_calendar_respond",
    {
      title: "Respond to calendar event invite",
      description:
        "Accept, decline, or mark tentative an event invite by setting the attendee responseStatus.",
      inputSchema: {
        eventId: z.string().describe("Event ID."),
        responseStatus: z
          .enum(["accepted", "declined", "tentative"])
          .describe("Attendance response to set."),
        email: z
          .string()
          .email()
          .optional()
          .describe("Attendee email to respond as (defaults to signed-in account)."),
        sendUpdates: z
          .enum(["all", "externalOnly", "none"])
          .optional()
          .describe("Who to notify of the change (defaults to none)."),
        calendarId: z.string().optional().describe("Calendar ID (default primary)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ eventId, responseStatus, email, sendUpdates, calendarId, account }) => {
      try {
        const client = await authManager.getClient(account);
        const resolved = await authManager.resolveAccount(account);
        const attendeeEmail = email ?? resolved.email;
        if (!attendeeEmail) {
          throw new Error(
            "No attendee email resolved. Pass email explicitly or ensure the account has a known email.",
          );
        }
        return ok(
          await respondToEvent(client, {
            eventId,
            calendarId,
            responseStatus,
            email: attendeeEmail,
            ...(sendUpdates ? { sendUpdates } : {}),
          }),
        );
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "google_calendar_create",
    {
      title: "Create calendar",
      description: "Create a secondary calendar with a name, timezone, and description.",
      inputSchema: {
        summary: z.string().describe("Calendar name."),
        timeZone: z.string().optional().describe("IANA timezone (e.g. America/Los_Angeles)."),
        description: z.string().optional(),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ summary, timeZone, description, account }) =>
      withClient(account, (client) => createCalendar(client, { summary, timeZone, description })),
  );

  server.registerTool(
    "google_calendar_update",
    {
      title: "Update calendar",
      description: "Update a calendar's name, color, timezone, or description (partial).",
      inputSchema: {
        calendarId: z.string().describe("Calendar ID."),
        summary: z.string().optional().describe("New calendar name."),
        colorId: z.string().optional().describe("Color ID (1-24)."),
        timeZone: z.string().optional().describe("IANA timezone (e.g. America/Los_Angeles)."),
        description: z.string().optional(),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ calendarId, summary, colorId, timeZone, description, account }) =>
      withClient(account, (client) =>
        updateCalendar(client, { calendarId, summary, colorId, timeZone, description }),
      ),
  );

  server.registerTool(
    "google_calendar_delete",
    {
      title: "Delete calendar",
      description: "Delete a secondary calendar permanently (destructive).",
      inputSchema: {
        calendarId: z.string().describe("Calendar ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ calendarId, account }) => {
      try {
        const client = await authManager.getClient(account);
        await deleteCalendar(client, { calendarId });
        return ok({ status: "deleted", calendarId });
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "google_calendar_free_busy",
    {
      title: "Query calendar free/busy",
      description: "Query busy intervals across calendars to find free meeting windows.",
      inputSchema: {
        timeMin: z.string().describe("Start of range (RFC3339 datetime)."),
        timeMax: z.string().describe("End of range (RFC3339 datetime)."),
        items: z.array(z.string()).optional().describe("Calendar IDs to query (default primary)."),
        timeZone: z.string().optional().describe("IANA timezone (e.g. America/Los_Angeles)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ timeMin, timeMax, items, timeZone, account }) =>
      withClient(account, (client) => queryFreeBusy(client, { timeMin, timeMax, items, timeZone })),
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
    async ({ query, pageSize, account }) =>
      withClient(account, (client) => listDriveFiles(client, { query, pageSize })),
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
    async ({ fileId, account }) =>
      withClient(account, (client) => getDriveFile(client, { fileId })),
  );

  server.registerTool(
    "google_drive_upload",
    {
      title: "Create/upload Drive file",
      description:
        "Create a file in Drive, optionally with text content (blank Google-native file if omitted) or by local file path (binary-safe).",
      inputSchema: {
        name: z.string().describe("File name."),
        mimeType: z
          .string()
          .describe(
            "MIME type (e.g. text/plain, image/png, application/vnd.google-apps.document).",
          ),
        content: z.string().optional().describe("Text content to upload."),
        path: z
          .string()
          .optional()
          .describe(
            "Local file path to upload (reads raw bytes from disk; use instead of content).",
          ),
        parentFolderId: z.string().optional().describe("Parent folder ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ name, mimeType, content, path, parentFolderId, account }) =>
      withClient(account, (client) =>
        uploadDriveFile(client, { name, mimeType, content, path, parentFolderId }),
      ),
  );

  server.registerTool(
    "google_drive_update",
    {
      title: "Update Drive file",
      description: "Rename a file and/or replace its content (text or local file path).",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        name: z.string().optional().describe("New name."),
        mimeType: z.string().optional(),
        content: z.string().optional().describe("New content."),
        path: z
          .string()
          .optional()
          .describe(
            "Local file path to upload as new content (reads raw bytes; use instead of content).",
          ),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, name, mimeType, content, path, account }) =>
      withClient(account, (client) =>
        updateDriveFile(client, { fileId, name, mimeType, content, path }),
      ),
  );

  server.registerTool(
    "google_drive_delete",
    {
      title: "Delete Drive file",
      description:
        "Permanently delete a file from Drive. IRREVERSIBLE — prefer google_drive_trash (recoverable).",
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
    },
  );

  server.registerTool(
    "google_drive_trash",
    {
      title: "Move Drive file to trash",
      description:
        "Move a file to trash (recoverable via google_drive_restore). Safer than google_drive_delete.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, account }) => {
      try {
        const client = await authManager.getClient(account);
        const file = await trashDriveFile(client, { fileId });
        return ok({ status: "trashed", fileId, trashed: file.trashed });
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "google_drive_restore",
    {
      title: "Restore Drive file from trash",
      description: "Restore a trashed file (sets trashed: false).",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, account }) => {
      try {
        const client = await authManager.getClient(account);
        const file = await restoreDriveFile(client, { fileId });
        return ok({ status: "restored", fileId, trashed: file.trashed });
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "google_drive_share",
    {
      title: "Share Drive file",
      description:
        "Share a file with a user/group by email, anyone with the link, or a domain; optionally transfer ownership.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        email: z
          .string()
          .email()
          .optional()
          .describe("Recipient email (required for type user/group)."),
        role: z.enum(["reader", "writer", "commenter", "owner"]).describe("Access role."),
        type: z
          .enum(["user", "group", "anyone", "domain"])
          .optional()
          .describe("Permission type (default user)."),
        domain: z.string().optional().describe("Domain for type=domain, e.g. example.com."),
        transferOwnership: z
          .boolean()
          .optional()
          .describe("Transfer ownership to the recipient (requires role=owner)."),
        sendNotificationEmail: z
          .boolean()
          .optional()
          .describe("Email the recipient (default true)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      fileId,
      email,
      role,
      type,
      domain,
      transferOwnership,
      sendNotificationEmail,
      account,
    }) =>
      withClient(account, (client) =>
        shareDriveFile(client, {
          fileId,
          email,
          role,
          type,
          domain,
          transferOwnership,
          sendNotificationEmail,
        }),
      ),
  );

  server.registerTool(
    "google_drive_list_permissions",
    {
      title: "List Drive file permissions",
      description: "List who can access a file and with what role.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, account }) =>
      withClient(account, (client) => listDrivePermissions(client, { fileId })),
  );

  server.registerTool(
    "google_drive_delete_permission",
    {
      title: "Delete Drive file permission",
      description: "Revoke a permission from a file by permission ID.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        permissionId: z.string().describe("Permission ID (from google_drive_list_permissions)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, permissionId, account }) =>
      withClient(account, (client) => deleteDrivePermission(client, { fileId, permissionId })),
  );

  server.registerTool(
    "google_drive_download",
    {
      title: "Download Drive file",
      description:
        "Download a file's raw bytes (non-Google-native files). Text content returns decoded text; binary returns base64. Pass saveToPath to write bytes to a local file instead.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        saveToPath: z
          .string()
          .optional()
          .describe("Local path to write the raw bytes to (returns { savedTo } instead of data)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, saveToPath, account }) =>
      withClient(account, (client) => downloadDriveFile(client, { fileId, saveToPath })),
  );

  server.registerTool(
    "google_drive_export",
    {
      title: "Export Drive file",
      description:
        "Export a Google-native file (Docs/Sheets/Slides/Drawings) to another format (e.g. application/pdf, text/plain, application/vnd.openxmlformats-officedocument.wordprocessingml.document).",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        mimeType: z.string().describe("Target MIME type (e.g. application/pdf)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, mimeType, account }) =>
      withClient(account, (client) => exportDriveFile(client, { fileId, mimeType })),
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
      withClient(account, (client) => createDriveFolder(client, { name, parentFolderId })),
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
    async ({ fileId, name, account }) =>
      withClient(account, (client) => copyDriveFile(client, { fileId, name })),
  );

  server.registerTool(
    "google_drive_move",
    {
      title: "Move Drive file to folder",
      description:
        "Move a file into a folder. Provide removeParentFolderId to also remove it from its current folder (true move); omit to add it to an additional folder.",
      inputSchema: {
        fileId: z.string().describe("Drive file ID."),
        parentFolderId: z.string().describe("Destination folder ID."),
        removeParentFolderId: z
          .string()
          .optional()
          .describe("Current folder ID to remove the file from (optional)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ fileId, parentFolderId, removeParentFolderId, account }) =>
      withClient(account, (client) =>
        moveDriveFile(client, { fileId, parentFolderId, removeParentFolderId }),
      ),
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
    async ({ pageSize, account }) =>
      withClient(account, (client) => listContacts(client, { pageSize })),
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
    async ({ query, account }) =>
      withClient(account, (client) => searchContacts(client, { query })),
  );

  server.registerTool(
    "google_contacts_create",
    {
      title: "Create contact",
      description:
        "Create a new contact with a name and optional email/phone/address/organization/photo.",
      inputSchema: {
        name: z.string().describe("Contact full name."),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional().describe("Freeform postal address."),
        organization: z.string().optional(),
        photoBytes: z.string().optional().describe("Base64-encoded photo bytes (JPEG/PNG)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ name, email, phone, address, organization, photoBytes, account }) =>
      withClient(account, (client) =>
        createContact(client, { name, email, phone, address, organization, photoBytes }),
      ),
  );

  server.registerTool(
    "google_contacts_update",
    {
      title: "Update contact",
      description:
        "Update an existing contact's name, email, phone, address, organization, or photo (partial update by resourceName).",
      inputSchema: {
        resourceName: z
          .string()
          .describe("Contact resource name, e.g. people/123 (from list/search)."),
        name: z.string().optional().describe("New full name."),
        email: z.string().email().optional().describe("New email."),
        phone: z.string().optional().describe("New phone number."),
        address: z.string().optional().describe("Freeform postal address."),
        organization: z.string().optional(),
        photoBytes: z.string().optional().describe("Base64-encoded photo bytes (JPEG/PNG)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ resourceName, name, email, phone, address, organization, photoBytes, account }) =>
      withClient(account, (client) =>
        updateContact(client, {
          resourceName,
          name,
          email,
          phone,
          address,
          organization,
          photoBytes,
        }),
      ),
  );

  server.registerTool(
    "google_contacts_get",
    {
      title: "Get contact",
      description:
        "Get a contact by resourceName with rich fields (name, email, phone, address, org).",
      inputSchema: {
        resourceName: z
          .string()
          .describe("Contact resource name, e.g. people/123 (from list/search)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ resourceName, account }) =>
      withClient(account, (client) => getContact(client, { resourceName })),
  );

  server.registerTool(
    "google_contacts_delete",
    {
      title: "Delete contact",
      description: "Delete a contact by resourceName.",
      inputSchema: {
        resourceName: z
          .string()
          .describe("Contact resource name, e.g. people/123 (from list/search)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ resourceName, account }) =>
      withClient(account, (client) => deleteContact(client, { resourceName })),
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
    async ({ account }) => withClient(account, (client) => listTaskLists(client)),
  );

  server.registerTool(
    "google_tasks_list",
    {
      title: "List tasks",
      description: "List tasks in a task list (default list if not specified).",
      inputSchema: {
        tasklistId: z.string().optional().describe("Task list ID (default @default)."),
        dueBefore: z
          .string()
          .optional()
          .describe("Only tasks due at or before this RFC3339 datetime."),
        dueAfter: z
          .string()
          .optional()
          .describe("Only tasks due at or after this RFC3339 datetime."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ tasklistId, dueBefore, dueAfter, account }) =>
      withClient(account, (client) =>
        listTasks(client, {
          tasklistId,
          dueMax: dueBefore,
          dueMin: dueAfter,
        }),
      ),
  );

  server.registerTool(
    "google_tasks_create",
    {
      title: "Create task",
      description: "Create a task, optionally with notes, due date, or as a subtask.",
      inputSchema: {
        title: z.string().describe("Task title."),
        notes: z.string().optional(),
        due: z.string().optional().describe("Due date (RFC3339, e.g. 2026-08-15T17:00:00Z)."),
        parentTaskId: z.string().optional().describe("Parent task ID to create a subtask."),
        tasklistId: z.string().optional().describe("Task list ID (default @default)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, notes, due, parentTaskId, tasklistId, account }) =>
      withClient(account, (client) =>
        createTask(client, { title, notes, due, parentTaskId, tasklistId }),
      ),
  );

  server.registerTool(
    "google_tasks_update",
    {
      title: "Update task",
      description: "Update a task's title, notes, due date, or status (partial).",
      inputSchema: {
        taskId: z.string().describe("Task ID."),
        title: z.string().optional().describe("New task title."),
        notes: z.string().optional().describe("New task notes."),
        due: z.string().optional().describe("Due date (RFC3339, e.g. 2026-08-15T17:00:00Z)."),
        status: z.enum(["needsAction", "completed"]).optional().describe("Task status."),
        tasklistId: z.string().optional().describe("Task list ID (default @default)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ taskId, title, notes, due, status, tasklistId, account }) =>
      withClient(account, (client) =>
        updateTask(client, { taskId, title, notes, due, status, tasklistId }),
      ),
  );

  server.registerTool(
    "google_tasks_create_list",
    {
      title: "Create task list",
      description: "Create a new Google Tasks list.",
      inputSchema: {
        title: z.string().describe("Task list title."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, account }) =>
      withClient(account, (client) => createTaskList(client, { title })),
  );

  server.registerTool(
    "google_tasks_update_list",
    {
      title: "Rename task list",
      description: "Rename a Google Tasks list.",
      inputSchema: {
        tasklistId: z.string().describe("Task list ID."),
        title: z.string().describe("New task list title."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ tasklistId, title, account }) =>
      withClient(account, (client) => updateTaskList(client, { tasklistId, title })),
  );

  server.registerTool(
    "google_tasks_delete_list",
    {
      title: "Delete task list",
      description: "Delete a Google Tasks list (removes its tasks).",
      inputSchema: {
        tasklistId: z.string().describe("Task list ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ tasklistId, account }) => {
      try {
        const client = await authManager.getClient(account);
        await deleteTaskList(client, { tasklistId });
        return ok({ status: "deleted", tasklistId });
      } catch (error) {
        return err(error);
      }
    },
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
    async ({ taskId, tasklistId, account }) =>
      withClient(account, (client) => completeTask(client, { taskId, tasklistId })),
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
    },
  );

  // ---- Sheets --------------------------------------------------------------
  server.registerTool(
    "google_sheets_get",
    {
      title: "Get spreadsheet",
      description: "Get spreadsheet metadata and optionally cell values from a range.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID (from the URL)."),
        range: z
          .string()
          .optional()
          .describe("A1 range to also read values from, e.g. Sheet1!A1:B5."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, account }) =>
      withClient(account, (client) => getSpreadsheet(client, { spreadsheetId, range })),
  );

  server.registerTool(
    "google_sheets_read",
    {
      title: "Read spreadsheet range",
      description: "Read cell values from a range as rows of strings.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        range: z.string().describe("A1 notation, e.g. Sheet1!A1:C10."),
        majorDimension: z
          .enum(["ROWS", "COLUMNS"])
          .optional()
          .describe("Read direction (default ROWS)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, majorDimension, account }) =>
      withClient(account, (client) =>
        readSheetRange(client, { spreadsheetId, range, majorDimension }),
      ),
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
        valueInputOption: z
          .enum(["RAW", "USER_ENTERED"])
          .optional()
          .describe("How to interpret values (default USER_ENTERED)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, values, valueInputOption, account }) =>
      withClient(account, (client) =>
        writeSheetRange(client, { spreadsheetId, range, values, valueInputOption }),
      ),
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
        valueInputOption: z
          .enum(["RAW", "USER_ENTERED"])
          .optional()
          .describe("How to interpret values (default USER_ENTERED)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, range, values, valueInputOption, account }) =>
      withClient(account, (client) =>
        appendSheetRange(client, { spreadsheetId, range, values, valueInputOption }),
      ),
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
    async ({ title, sheets, account }) =>
      withClient(account, (client) => createSpreadsheet(client, { title, sheets })),
  );

  server.registerTool(
    "google_sheets_batch_update",
    {
      title: "Batch update spreadsheet",
      description: "Send raw Sheets batchUpdate requests (add/delete sheets, formatting, etc.).",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        requests: z
          .array(z.record(z.string(), z.any()))
          .describe("Sheets API batchUpdate requests."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, requests, account }) =>
      withClient(account, (client) => batchUpdateSheet(client, { spreadsheetId, requests })),
  );

  server.registerTool(
    "google_sheets_add_sheet",
    {
      title: "Add spreadsheet tab",
      description: "Add a new tab (sheet) to a spreadsheet.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        title: z.string().describe("Title of the new tab."),
        index: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("0-based position to insert at (appended at end if omitted)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, title, index, account }) =>
      withClient(account, (client) => addSheet(client, { spreadsheetId, title, index })),
  );

  server.registerTool(
    "google_sheets_delete_sheet",
    {
      title: "Delete spreadsheet tab",
      description: "Permanently delete a tab (sheet) from a spreadsheet.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        sheetId: z.number().int().describe("Numeric sheet ID (from google_sheets_get metadata)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, sheetId, account }) => {
      try {
        const client = await authManager.getClient(account);
        const result = await deleteSheet(client, { spreadsheetId, sheetId });
        return ok({ status: "deleted", sheetId, ...result });
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "google_sheets_rename_sheet",
    {
      title: "Rename spreadsheet tab",
      description: "Rename a tab (sheet) in a spreadsheet.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        sheetId: z.number().int().describe("Numeric sheet ID (from google_sheets_get metadata)."),
        title: z.string().describe("New tab title."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, sheetId, title, account }) =>
      withClient(account, (client) => renameSheet(client, { spreadsheetId, sheetId, title })),
  );

  server.registerTool(
    "google_sheets_insert_rows",
    {
      title: "Insert rows",
      description: "Insert blank rows into a sheet at a 0-based row index.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        sheetId: z.number().int().describe("Numeric sheet ID (from google_sheets_get metadata)."),
        startIndex: z.number().int().describe("0-based row index where rows are inserted."),
        numRows: z.number().int().min(1).optional().describe("Number of rows (default 1)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, sheetId, startIndex, numRows, account }) =>
      withClient(account, (client) =>
        insertRows(client, { spreadsheetId, sheetId, startIndex, numRows }),
      ),
  );

  server.registerTool(
    "google_sheets_delete_rows",
    {
      title: "Delete rows",
      description: "Delete rows from a sheet starting at a 0-based row index.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        sheetId: z.number().int().describe("Numeric sheet ID (from google_sheets_get metadata)."),
        startIndex: z.number().int().describe("0-based row index of the first row to delete."),
        numRows: z.number().int().min(1).optional().describe("Number of rows (default 1)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, sheetId, startIndex, numRows, account }) =>
      withClient(account, (client) =>
        deleteRows(client, { spreadsheetId, sheetId, startIndex, numRows }),
      ),
  );

  server.registerTool(
    "google_sheets_get_named_ranges",
    {
      title: "Get named ranges",
      description: "List named ranges on a spreadsheet.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, account }) =>
      withClient(account, (client) => getNamedRanges(client, { spreadsheetId })),
  );

  server.registerTool(
    "google_sheets_set_named_range",
    {
      title: "Set named range",
      description: "Create a named range over a grid region.",
      inputSchema: {
        spreadsheetId: z.string().describe("Spreadsheet ID."),
        name: z.string().describe("Name of the named range."),
        range: z
          .object({
            sheetId: z.number().int().describe("Numeric sheet ID."),
            startRowIndex: z.number().int().optional().describe("Start row (inclusive)."),
            endRowIndex: z.number().int().optional().describe("End row (exclusive)."),
            startColumnIndex: z.number().int().optional().describe("Start column (inclusive)."),
            endColumnIndex: z.number().int().optional().describe("End column (exclusive)."),
          })
          .describe("Grid region the range covers."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ spreadsheetId, name, range, account }) =>
      withClient(account, (client) => setNamedRange(client, { spreadsheetId, name, range })),
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
    async ({ documentId, account }) =>
      withClient(account, (client) => getDocument(client, { documentId })),
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
    async ({ documentId, account }) =>
      withClient(account, (client) => getDocumentText(client, { documentId })),
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
    async ({ title, account }) =>
      withClient(account, (client) => createDocument(client, { title })),
  );

  server.registerTool(
    "google_docs_insert_text",
    {
      title: "Insert text in document",
      description: "Insert text into a document at an index or at the end.",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        text: z.string().describe("Text to insert."),
        index: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Character index to insert at (default end of document)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, text, index, account }) =>
      withClient(account, (client) => insertText(client, { documentId, text, index })),
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
      withClient(account, (client) =>
        replaceAllText(client, { documentId, find, replace, matchCase }),
      ),
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
      withClient(account, (client) => batchUpdateDocument(client, { documentId, requests })),
  );

  server.registerTool(
    "google_docs_delete_range",
    {
      title: "Delete range",
      description: "Delete a range of content from a document.",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        startIndex: z.number().int().describe("0-based start index (inclusive)."),
        endIndex: z.number().int().describe("0-based end index (exclusive)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, startIndex, endIndex, account }) =>
      withClient(account, (client) => deleteRange(client, { documentId, startIndex, endIndex })),
  );

  server.registerTool(
    "google_docs_insert_table",
    {
      title: "Insert table",
      description: "Insert an empty table at a model index (a newline is added before it).",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        rows: z.number().int().describe("Number of rows."),
        columns: z.number().int().describe("Number of columns."),
        index: z.number().int().describe("0-based index where the table is inserted."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, rows, columns, index, account }) =>
      withClient(account, (client) => insertTable(client, { documentId, rows, columns, index })),
  );

  server.registerTool(
    "google_docs_insert_inline_image",
    {
      title: "Insert inline image",
      description: "Insert an inline image from a public URI and return the created object id.",
      inputSchema: {
        documentId: z.string().describe("Document ID."),
        uri: z.string().describe("Publicly accessible PNG/JPEG/GIF URI (< 50MB, <= 25MP)."),
        index: z.number().int().describe("0-based index inside an existing paragraph."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ documentId, uri, index, account }) =>
      withClient(account, (client) => insertInlineImage(client, { documentId, uri, index })),
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
    async ({ presentationId, account }) =>
      withClient(account, (client) => getPresentation(client, { presentationId })),
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
    async ({ title, account }) =>
      withClient(account, (client) => createPresentation(client, { title })),
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
      withClient(account, (client) =>
        replaceSlidesText(client, { presentationId, find, replace, matchCase }),
      ),
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
    async ({ presentationId, account }) =>
      withClient(account, (client) => createSlide(client, { presentationId })),
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
      withClient(account, (client) => deleteSlide(client, { presentationId, slideObjectId })),
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
      withClient(account, (client) => getSlidePage(client, { presentationId, pageObjectId })),
  );

  server.registerTool(
    "google_slides_batch_update",
    {
      title: "Batch update presentation",
      description:
        "Send raw Slides batchUpdate requests (create textboxes, shapes, images, style elements, etc.).",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        requests: z.array(z.any()).describe("Slides API batchUpdate requests array."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, requests, account }) =>
      withClient(account, (client) =>
        batchUpdatePresentation(client, { presentationId, requests }),
      ),
  );

  server.registerTool(
    "google_slides_duplicate_slide",
    {
      title: "Duplicate slide",
      description: "Duplicate a slide and return the new slide object ID.",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        slideObjectId: z.string().describe("Object ID of the slide to duplicate."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, slideObjectId, account }) =>
      withClient(account, (client) => duplicateSlide(client, { presentationId, slideObjectId })),
  );

  server.registerTool(
    "google_slides_move_slide",
    {
      title: "Move slide",
      description: "Move a slide to a new position in the deck by insertion index.",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        slideObjectId: z.string().describe("Object ID of the slide to move."),
        insertionIndex: z.number().describe("0-based index where the slide should be inserted."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, slideObjectId, insertionIndex, account }) =>
      withClient(account, (client) =>
        moveSlide(client, { presentationId, slideObjectId, insertionIndex }),
      ),
  );

  server.registerTool(
    "google_slides_create_textbox",
    {
      title: "Create textbox",
      description: "Create a text box on a slide, optionally with initial text. Sizes in points.",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        pageObjectId: z.string().describe("Object ID of the slide to add the text box to."),
        text: z.string().optional().describe("Initial text content."),
        width: z.number().optional().describe("Width in points (default 100)."),
        height: z.number().optional().describe("Height in points (default 50)."),
        x: z.number().optional().describe("Left offset in points (default 0)."),
        y: z.number().optional().describe("Top offset in points (default 0)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, pageObjectId, text, width, height, x, y, account }) =>
      withClient(account, (client) =>
        createTextbox(client, { presentationId, pageObjectId, text, width, height, x, y }),
      ),
  );

  server.registerTool(
    "google_slides_create_image",
    {
      title: "Create image",
      description: "Insert an image from a URL onto a slide. Sizes in points.",
      inputSchema: {
        presentationId: z.string().describe("Presentation ID."),
        pageObjectId: z.string().describe("Object ID of the slide to add the image to."),
        url: z.string().describe("Public URL of the image."),
        width: z.number().optional().describe("Width in points (default 200)."),
        height: z.number().optional().describe("Height in points (default 150)."),
        x: z.number().optional().describe("Left offset in points (default 0)."),
        y: z.number().optional().describe("Top offset in points (default 0)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ presentationId, pageObjectId, url, width, height, x, y, account }) =>
      withClient(account, (client) =>
        createImage(client, { presentationId, pageObjectId, url, width, height, x, y }),
      ),
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
    async ({ query, maxResults, account }) =>
      withClient(account, (client) => searchVideos(client, { query, maxResults })),
  );

  server.registerTool(
    "google_youtube_upload",
    {
      title: "Upload YouTube video",
      description:
        "Upload a video to YouTube. Provide a local file path (preferred) or base64 content. Defaults to private.",
      inputSchema: {
        path: z.string().optional().describe("Local file path of the video (preferred)."),
        content: z
          .string()
          .optional()
          .describe("Base64-encoded video bytes (small files only). Mutually exclusive with path."),
        title: z.string().describe("Video title."),
        description: z.string().optional().describe("Video description."),
        tags: z.array(z.string()).optional().describe("Video tags."),
        privacyStatus: z
          .enum(["public", "private", "unlisted"])
          .optional()
          .describe("Privacy (default private)."),
        categoryId: z.string().optional().describe("YouTube category ID."),
        notifySubscribers: z.boolean().optional().describe("Notify subscribers (default false)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({
      path: filePath,
      content,
      title,
      description,
      tags,
      privacyStatus,
      categoryId,
      notifySubscribers,
      account,
    }) =>
      withClient(account, (client) =>
        uploadVideo(client, {
          path: filePath,
          content,
          title,
          description,
          tags,
          privacyStatus,
          categoryId,
          notifySubscribers,
        }),
      ),
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
    async ({ videoId, account }) => withClient(account, (client) => getVideo(client, { videoId })),
  );

  server.registerTool(
    "google_youtube_update_video",
    {
      title: "Update YouTube video metadata",
      description: "Update a video's title, description, tags or privacy status.",
      inputSchema: {
        videoId: z.string().describe("YouTube video ID."),
        title: z.string().optional().describe("New video title."),
        description: z.string().optional().describe("New video description."),
        tags: z.array(z.string()).optional().describe("New video tags."),
        privacyStatus: z
          .enum(["public", "private", "unlisted"])
          .optional()
          .describe("New privacy status."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ videoId, title, description, tags, privacyStatus, account }) =>
      withClient(account, (client) =>
        updateVideo(client, { videoId, title, description, tags, privacyStatus }),
      ),
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
    async ({ maxResults, account }) =>
      withClient(account, (client) => getMyVideos(client, { maxResults })),
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
    async ({ maxResults, account }) =>
      withClient(account, (client) => listPlaylists(client, { maxResults })),
  );

  server.registerTool(
    "google_youtube_create_playlist",
    {
      title: "Create YouTube playlist",
      description: "Create a private playlist for the user.",
      inputSchema: {
        title: z.string().describe("Playlist title."),
        description: z.string().optional().describe("Playlist description."),
        privacyStatus: z
          .enum(["private", "public", "unlisted"])
          .optional()
          .describe("Privacy (default private)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ title, description, privacyStatus, account }) =>
      withClient(account, (client) =>
        createPlaylist(client, { title, description, privacyStatus }),
      ),
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
    async ({ playlistId, account }) =>
      withClient(account, (client) => deletePlaylist(client, { playlistId })),
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
      withClient(account, (client) => addVideoToPlaylist(client, { playlistId, videoId })),
  );

  server.registerTool(
    "google_youtube_remove_from_playlist",
    {
      title: "Remove video from playlist",
      description: "Remove a video from a playlist by playlist item ID.",
      inputSchema: {
        playlistItemId: z.string().describe("Playlist item ID to remove."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ playlistItemId, account }) =>
      withClient(account, (client) => removeVideoFromPlaylist(client, { playlistItemId })),
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
    async ({ maxResults, account }) =>
      withClient(account, (client) => listSubscriptions(client, { maxResults })),
  );

  server.registerTool(
    "google_youtube_list_comments",
    {
      title: "List YouTube video comments",
      description: "List comment threads for a video, most recent first.",
      inputSchema: {
        videoId: z.string().describe("YouTube video ID."),
        maxResults: z.number().min(1).max(100).optional().describe("Max results (default 20)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ videoId, maxResults, account }) =>
      withClient(account, (client) => listComments(client, { videoId, maxResults })),
  );

  server.registerTool(
    "google_youtube_insert_comment",
    {
      title: "Post a YouTube comment",
      description: "Post a top-level comment on a video.",
      inputSchema: {
        videoId: z.string().describe("YouTube video ID."),
        text: z.string().describe("Comment text."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ videoId, text, account }) =>
      withClient(account, (client) => insertComment(client, { videoId, text })),
  );

  server.registerTool(
    "google_youtube_set_comment_moderation",
    {
      title: "Set YouTube comment moderation status",
      description: "Hold, reject, or flag a comment as likely spam.",
      inputSchema: {
        commentId: z.string().describe("Comment ID to moderate."),
        moderationStatus: z
          .enum(["heldForReview", "published", "rejected"])
          .describe("Moderation status to apply."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ commentId, moderationStatus, account }) =>
      withClient(account, (client) =>
        setCommentModeration(client, { commentId, moderationStatus }),
      ),
  );

  server.registerTool(
    "google_youtube_mark_comment_spam",
    {
      title: "Mark YouTube comment as spam",
      description: "Mark a comment as spam.",
      inputSchema: {
        commentId: z.string().describe("Comment ID to mark as spam."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ commentId, account }) =>
      withClient(account, (client) => markCommentAsSpam(client, { commentId })),
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
    async ({ formId, account }) => withClient(account, (client) => getForm(client, { formId })),
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
    async ({ formId, pageSize, account }) =>
      withClient(account, (client) => getFormResponses(client, { formId, pageSize })),
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
    async ({ title, account }) => withClient(account, (client) => createForm(client, { title })),
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
        type: z
          .enum(["text", "multiple_choice"])
          .optional()
          .describe("Question type (default text)."),
        options: z.array(z.string()).optional().describe("Choices for multiple_choice."),
        required: z
          .boolean()
          .optional()
          .describe("Whether the question is required (default false)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, title, description, type, options, required, account }) =>
      withClient(account, (client) =>
        addQuestion(client, { formId, title, description, type, options, required }),
      ),
  );

  server.registerTool(
    "google_forms_update_question",
    {
      title: "Update form question",
      description: "Update a question's title, description, options or required flag.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        questionId: z.string().describe("Question ID (from form structure)."),
        title: z.string().optional().describe("New question text."),
        description: z.string().optional().describe("New help text."),
        options: z.array(z.string()).optional().describe("New choices (choice questions only)."),
        required: z.boolean().optional().describe("Required flag."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, questionId, title, description, options, required, account }) =>
      withClient(account, (client) =>
        updateFormQuestion(client, { formId, questionId, title, description, options, required }),
      ),
  );

  server.registerTool(
    "google_forms_delete_question",
    {
      title: "Delete form question",
      description: "Delete a question from a form by questionId.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        questionId: z.string().describe("Question ID to delete."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, questionId, account }) =>
      withClient(account, (client) => deleteFormQuestion(client, { formId, questionId })),
  );

  server.registerTool(
    "google_forms_move_question",
    {
      title: "Move form question",
      description: "Reorder a question to a new position in the form.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        questionId: z.string().describe("Question ID to move."),
        newIndex: z.number().min(0).describe("Destination item index (0-based)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, questionId, newIndex, account }) =>
      withClient(account, (client) => moveFormQuestion(client, { formId, questionId, newIndex })),
  );

  server.registerTool(
    "google_forms_rename",
    {
      title: "Rename form",
      description: "Update a form's title.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        title: z.string().describe("New form title."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, title, account }) =>
      withClient(account, (client) => renameForm(client, { formId, title })),
  );

  server.registerTool(
    "google_forms_delete",
    {
      title: "Delete form",
      description: "Permanently delete a form.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, account }) => withClient(account, (client) => deleteForm(client, { formId })),
  );

  server.registerTool(
    "google_forms_export_responses",
    {
      title: "Export form responses to Sheets",
      description: "Append form responses (headers + rows) to a spreadsheet tab.",
      inputSchema: {
        formId: z.string().describe("Form ID."),
        spreadsheetId: z.string().describe("Destination spreadsheet ID."),
        sheetName: z.string().optional().describe("Tab name (default Sheet1)."),
        account: z.string().optional().describe("Account nickname to use."),
      },
    },
    async ({ formId, spreadsheetId, sheetName, account }) =>
      withClient(account, (client) =>
        exportFormResponsesToSheet(client, { formId, spreadsheetId, sheetName }),
      ),
  );
}

import type { Auth } from "googleapis";
import { google } from "googleapis";

export interface SendGmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body: string;
  bodyType?: "text" | "html";
}

export interface ListGmailOptions {
  query?: string;
  maxResults?: number;
}

export interface GetGmailOptions {
  id: string;
  format?: "full" | "metadata" | "minimal";
}

export interface ModifyGmailOptions {
  id: string;
  addLabels?: string[];
  removeLabels?: string[];
}

export interface ReplyGmailOptions {
  threadId: string;
  messageId: string;
  body: string;
  bodyType?: "text" | "html";
}

export interface GmailMessageSummary {
  id: string;
  threadId?: string;
  snippet?: string;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  labelIds?: string[];
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body: string;
  hasAttachments: boolean;
}

const CRLF = "\r\n";

function headerValue(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  const h = headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function joinRecipients(r: string | string[] | undefined): string {
  if (!r) return "";
  return Array.isArray(r) ? r.join(", ") : r;
}

/** Build a raw RFC2822 message. Not base64-encoded yet. */
export function buildRawMessage(opts: SendGmailOptions): string {
  const to = joinRecipients(opts.to);
  if (!to) throw new Error("A recipient is required (to).");
  if (!opts.subject.trim() && !opts.body.trim()) {
    throw new Error("A subject or a body is required.");
  }
  const lines: string[] = [];
  lines.push(`To: ${to}`);
  const cc = joinRecipients(opts.cc);
  if (cc) lines.push(`Cc: ${cc}`);
  const bcc = joinRecipients(opts.bcc);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${opts.subject.replace(/[\r\n]+/g, " ")}`);
  lines.push("MIME-Version: 1.0");
  const contentType = opts.bodyType === "html" ? "text/html" : "text/plain";
  lines.push(`Content-Type: ${contentType}; charset=UTF-8`);
  lines.push("Content-Transfer-Encoding: quoted-printable");
  lines.push("");
  lines.push(opts.body.replace(/\r?\n/g, CRLF));
  return lines.join(CRLF);
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

/** Extract the best body (prefer text/plain) from a Gmail payload tree. */
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  if (Array.isArray(payload.parts)) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    const chosen = plain ?? payload.parts[0];
    return extractBody(chosen);
  }
  return "";
}

function parseHeaders(headers: Array<{ name: string; value: string }> | undefined) {
  return {
    from: headerValue(headers, "From"),
    to: headerValue(headers, "To"),
    subject: headerValue(headers, "Subject"),
    date: headerValue(headers, "Date"),
    messageId: headerValue(headers, "Message-ID"),
    references: headerValue(headers, "References"),
  };
}

/** Send an email. Returns { id, threadId }. */
export async function sendGmail(client: Auth.OAuth2Client, opts: SendGmailOptions) {
  const raw = toBase64Url(buildRawMessage(opts));
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return res.data as { id: string; threadId?: string };
}

/** List messages, newest first, optionally filtered by a Gmail query. */
export async function listGmailMessages(client: Auth.OAuth2Client, opts: ListGmailOptions): Promise<GmailMessageSummary[]> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.messages.list({
    userId: "me",
    q: opts.query || undefined,
    maxResults: opts.maxResults ?? 25,
  });
  return (res.data.messages ?? []).map((m: any) => ({
    id: m.id as string,
    threadId: m.threadId as string | undefined,
    snippet: m.snippet as string | undefined,
  }));
}

/** Get a single message with parsed headers, body and attachment flags. */
export async function getGmailMessage(client: Auth.OAuth2Client, opts: GetGmailOptions): Promise<GmailMessageDetail> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.messages.get({ userId: "me", id: opts.id, format: opts.format ?? "full" });
  const msg = res.data as any;
  const payload = msg.payload ?? {};
  const headers = payload.headers ?? [];
  const parsed = parseHeaders(headers);
  const hasAttachments =
    Array.isArray(payload.parts) &&
    payload.parts.some((p: any) => p.filename && p.filename.length > 0);
  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds ?? [],
    snippet: msg.snippet,
    from: parsed.from,
    to: parsed.to,
    subject: parsed.subject,
    date: parsed.date,
    body: extractBody(payload),
    hasAttachments,
  };
}

/** Add/remove labels on a message. Returns the updated labelIds. */
export async function modifyGmailMessage(client: Auth.OAuth2Client, opts: ModifyGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.messages.modify({
    userId: "me",
    id: opts.id,
    requestBody: {
      addLabelIds: opts.addLabels ?? [],
      removeLabelIds: opts.removeLabels ?? [],
    },
  });
  return res.data as { id: string; labelIds: string[] };
}

/** Reply to an existing message inside its thread, using proper In-Reply-To/References. */
export async function replyGmail(client: Auth.OAuth2Client, opts: ReplyGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  const orig = (await gmail.users.messages.get({ userId: "me", id: opts.messageId })).data as any;
  const headers = orig.payload?.headers ?? [];
  const parsed = parseHeaders(headers);

  const raw = toBase64Url(
    [
      `To: ${parsed.from}`,
      `Subject: ${(parsed.subject.startsWith("Re:") ? parsed.subject : `Re: ${parsed.subject}`).replace(/[\r\n]+/g, " ")}`,
      `In-Reply-To: ${parsed.messageId}`,
      `References: ${[parsed.references, parsed.messageId].filter(Boolean).join(" ")}`,
      "MIME-Version: 1.0",
      `Content-Type: ${opts.bodyType === "html" ? "text/html" : "text/plain"}; charset=UTF-8`,
      "Content-Transfer-Encoding: quoted-printable",
      "",
      opts.body.replace(/\r?\n/g, CRLF),
    ].join(CRLF)
  );

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: opts.threadId },
  });
  return res.data as { id: string; threadId?: string };
}

// ---- Attachments ---------------------------------------------------------

export interface GmailAttachmentInfo {
  id: string;
  /** Stable across messages.get calls — use for lookups. Gmail rotates `id`. */
  partId?: string;
  filename: string;
  mimeType: string;
  size?: number;
}

export interface GmailAttachmentData extends GmailAttachmentInfo {
  /** Base64url-encoded raw bytes. */
  dataBase64: string;
  /** Decoded text when the MIME type is text-like. */
  text?: string;
}

/** Walk a Gmail payload tree collecting attachment parts. */
function collectAttachments(payload: any): GmailAttachmentInfo[] {
  const out: GmailAttachmentInfo[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({
        id: p.body.attachmentId,
        partId: p.partId as string | undefined,
        filename: p.filename,
        mimeType: p.mimeType,
        size: p.body.size as number | undefined,
      });
    }
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);
  return out;
}

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    /(json|xml|csv|javascript|yaml|markdown|rtf)$/i.test(mime) ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** List attachments on a message (metadata only, no bytes). */
export async function listGmailAttachments(
  client: Auth.OAuth2Client,
  opts: GetGmailOptions
): Promise<GmailAttachmentInfo[]> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.messages.get({ userId: "me", id: opts.id, format: "full" });
  return collectAttachments((res.data as any).payload);
}

/** Download a single attachment by messageId + attachmentId (or stable partId). */
export async function getGmailAttachment(
  client: Auth.OAuth2Client,
  opts: GetGmailOptions & { attachmentId: string; partId?: string }
): Promise<GmailAttachmentData> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const msg = (await gmail.users.messages.get({ userId: "me", id: opts.id, format: "full" })).data as any;
  const atts = collectAttachments(msg.payload);
  // Gmail rotates body.attachmentId on every messages.get call, so a caller's
  // stored attachmentId may no longer match. Match by the stable partId first,
  // then fall back to attachmentId for backward compatibility.
  const part =
    (opts.partId ? atts.find((a) => a.partId === opts.partId) : undefined) ??
    atts.find((a) => a.id === opts.attachmentId);
  // Always download with the FRESH attachmentId from this fetch (stale IDs
  // also work for the bytes call, but the fresh one is guaranteed valid).
  const attachmentId = part?.id ?? opts.attachmentId;
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId: opts.id,
    id: attachmentId,
  });
  const dataBase64 = (res.data.data ?? "") as string;
  const mimeType = part?.mimeType ?? "application/octet-stream";
  const out: GmailAttachmentData = {
    id: attachmentId,
    partId: part?.partId,
    filename: part?.filename ?? "attachment",
    mimeType,
    size: part?.size ?? res.data.size ?? 0,
    dataBase64,
  };
  if (isTextMime(mimeType)) {
    out.text = Buffer.from(dataBase64, "base64url").toString("utf8");
  }
  return out;
}

// ---- Drafts ---------------------------------------------------------------

export interface DraftSummary {
  id: string;
  messageId?: string;
  threadId?: string;
  snippet?: string;
}

export interface DraftDetail extends GmailMessageDetail {
  draftId: string;
}

/** Create a draft (same options as send, but nothing is delivered). */
export async function createGmailDraft(client: Auth.OAuth2Client, opts: SendGmailOptions): Promise<DraftSummary> {
  const raw = toBase64Url(buildRawMessage(opts));
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });
  return {
    id: res.data.id as string,
    messageId: res.data.message?.id as string | undefined,
    threadId: res.data.message?.threadId as string | undefined,
  };
}

/** List drafts, newest first. */
export async function listGmailDrafts(
  client: Auth.OAuth2Client,
  opts: { maxResults?: number }
): Promise<DraftSummary[]> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.drafts.list({ userId: "me", maxResults: opts.maxResults ?? 25 });
  return (res.data.drafts ?? []).map((d: any) => ({
    id: d.id as string,
    messageId: d.message?.id as string | undefined,
    threadId: d.message?.threadId as string | undefined,
    snippet: d.message?.snippet as string | undefined,
  }));
}

/** Get a single draft with parsed headers and body. */
export async function getGmailDraft(client: Auth.OAuth2Client, opts: GetGmailOptions): Promise<DraftDetail> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.drafts.get({ userId: "me", id: opts.id, format: "full" });
  const draft = res.data as any;
  const msg = draft.message ?? {};
  const payload = msg.payload ?? {};
  const headers = payload.headers ?? [];
  const parsed = parseHeaders(headers);
  const hasAttachments =
    Array.isArray(payload.parts) && payload.parts.some((p: any) => p.filename && p.filename.length > 0);
  return {
    draftId: draft.id,
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds ?? [],
    snippet: msg.snippet,
    from: parsed.from,
    to: parsed.to,
    subject: parsed.subject,
    date: parsed.date,
    body: extractBody(payload),
    hasAttachments,
  };
}

/** Send an existing draft. */
export async function sendGmailDraft(client: Auth.OAuth2Client, opts: GetGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.drafts.send({ userId: "me", requestBody: { id: opts.id } });
  return res.data as { id: string; threadId?: string };
}

/** Delete a draft. */
export async function deleteGmailDraft(client: Auth.OAuth2Client, opts: GetGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.drafts.delete({ userId: "me", id: opts.id });
  return { deleted: true, id: opts.id };
}

// ---- Labels ---------------------------------------------------------------

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
}

export interface CreateGmailLabelOptions {
  name: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
}

/** List all labels. */
export async function listGmailLabels(client: Auth.OAuth2Client): Promise<GmailLabel[]> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.labels.list({ userId: "me" });
  return (res.data.labels ?? []).map((l: any) => ({
    id: l.id as string,
    name: l.name as string,
    type: l.type as string | undefined,
    messageListVisibility: l.messageListVisibility as string | undefined,
    labelListVisibility: l.labelListVisibility as string | undefined,
  }));
}

/** Create a custom label. */
export async function createGmailLabel(client: Auth.OAuth2Client, opts: CreateGmailLabelOptions): Promise<GmailLabel> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: opts.name,
      messageListVisibility: opts.messageListVisibility,
      labelListVisibility: opts.labelListVisibility,
    },
  });
  return res.data as GmailLabel;
}

/** Delete a label. */
export async function deleteGmailLabel(client: Auth.OAuth2Client, opts: GetGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.labels.delete({ userId: "me", id: opts.id });
  return { deleted: true, id: opts.id };
}

// ---- Trash / delete -------------------------------------------------------

/** Move a message to trash. */
export async function trashGmailMessage(client: Auth.OAuth2Client, opts: GetGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.messages.trash({ userId: "me", id: opts.id });
  return res.data as { id: string; labelIds: string[] };
}

/** Restore a message from trash. */
export async function untrashGmailMessage(client: Auth.OAuth2Client, opts: GetGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.messages.untrash({ userId: "me", id: opts.id });
  return res.data as { id: string; labelIds: string[] };
}

/** Permanently delete a message. */
export async function deleteGmailMessage(client: Auth.OAuth2Client, opts: GetGmailOptions) {
  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.messages.delete({ userId: "me", id: opts.id });
  return { deleted: true, id: opts.id };
}

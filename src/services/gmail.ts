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

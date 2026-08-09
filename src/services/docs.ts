import type { Auth, docs_v1 } from "googleapis";
import { google } from "googleapis";

export interface GetDocumentArgs {
  documentId: string;
}

export interface InsertTextArgs {
  documentId: string;
  text: string;
  /** Optional 0-based character index to insert at. Defaults to end of document. */
  index?: number;
}

export interface ReplaceAllTextArgs {
  documentId: string;
  find: string;
  replace: string;
  matchCase?: boolean;
}

export interface BatchUpdateArgs {
  documentId: string;
  requests: docs_v1.Schema$Request[];
}

export async function getDocument(client: Auth.OAuth2Client, { documentId }: GetDocumentArgs): Promise<any> {
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.get({ documentId });
  return res.data;
}

/** Extract plain text from the body's paragraph elements (text runs only). */
export async function getDocumentText(client: Auth.OAuth2Client, { documentId }: GetDocumentArgs): Promise<string> {
  const docs = google.docs({ version: "v1", auth: client });
  const doc = await docs.documents.get({ documentId });
  const content = doc.data.body?.content ?? [];
  const parts: string[] = [];
  for (const element of content) {
    if (element.paragraph) {
      const line = (element.paragraph.elements ?? [])
        .map((e) => e.textRun?.content ?? "")
        .join("");
      parts.push(line);
    }
  }
  return parts.join("\n") + (parts.length ? "\n" : "");
}

export async function createDocument(client: Auth.OAuth2Client, { title }: { title: string }): Promise<any> {
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.create({ requestBody: { title } });
  return res.data;
}

export async function insertText(
  client: Auth.OAuth2Client,
  { documentId, text, index }: InsertTextArgs
): Promise<any> {
  const docs = google.docs({ version: "v1", auth: client });
  let location: Record<string, unknown>;
  if (index !== undefined) {
    location = { location: { index } };
  } else {
    location = { endOfSegmentLocation: {} };
  }
  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests: [{ insertText: { ...location, text } }] },
  });
  return { inserted: true };
}

export async function replaceAllText(
  client: Auth.OAuth2Client,
  { documentId, find, replace, matchCase = true }: ReplaceAllTextArgs
): Promise<any> {
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        { replaceAllText: { containsText: { text: find, matchCase }, replaceText: replace } },
      ],
    },
  });
  return res.data.replies?.[0]?.replaceAllText ?? { occurrencesChanged: 0 };
}

export async function batchUpdateDocument(
  client: Auth.OAuth2Client,
  { documentId, requests }: BatchUpdateArgs
): Promise<any> {
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  return res.data;
}

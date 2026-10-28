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

export async function getDocument(
  client: Auth.OAuth2Client,
  { documentId }: GetDocumentArgs,
): Promise<docs_v1.Schema$Document> {
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.get({ documentId });
  return res.data;
}

function paragraphText(paragraph: docs_v1.Schema$Paragraph): string {
  return (paragraph.elements ?? []).map((e) => e.textRun?.content ?? "").join("");
}

/** Collect text from body or cell content, flattening tables one row per line. */
function collectText(elements: docs_v1.Schema$StructuralElement[], lines: string[]): void {
  for (const element of elements) {
    if (element.paragraph) {
      lines.push(paragraphText(element.paragraph));
      continue;
    }
    for (const row of element.table?.tableRows ?? []) {
      const cells = (row.tableCells ?? []).map((cell) => {
        const cellLines: string[] = [];
        collectText(cell.content ?? [], cellLines);
        return cellLines
          .map((line) => line.replace(/\n+$/, ""))
          .join(" ")
          .trim();
      });
      lines.push(cells.join("\t"));
    }
  }
}

/** Extract plain text from the body's paragraphs and tables (text runs only). */
export async function getDocumentText(
  client: Auth.OAuth2Client,
  { documentId }: GetDocumentArgs,
): Promise<string> {
  const docs = google.docs({ version: "v1", auth: client });
  const doc = await docs.documents.get({ documentId });
  const lines: string[] = [];
  collectText(doc.data.body?.content ?? [], lines);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export async function createDocument(
  client: Auth.OAuth2Client,
  { title }: { title: string },
): Promise<docs_v1.Schema$Document> {
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.create({ requestBody: { title } });
  return res.data;
}

export async function insertText(
  client: Auth.OAuth2Client,
  { documentId, text, index }: InsertTextArgs,
): Promise<{ inserted: boolean }> {
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
  { documentId, find, replace, matchCase = true }: ReplaceAllTextArgs,
): Promise<docs_v1.Schema$ReplaceAllTextResponse> {
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
  { documentId, requests }: BatchUpdateArgs,
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  return res.data;
}

export interface DeleteRangeArgs {
  documentId: string;
  /** 0-based start index (inclusive). */
  startIndex: number;
  /** 0-based end index (exclusive). */
  endIndex: number;
}

/** Delete a range of content from a document. */
export async function deleteRange(
  client: Auth.OAuth2Client,
  { documentId, startIndex, endIndex }: DeleteRangeArgs,
): Promise<{ deleted: boolean }> {
  await batchUpdateDocument(client, {
    documentId,
    requests: [{ deleteContentRange: { range: { startIndex, endIndex } } }],
  });
  return { deleted: true };
}

export interface InsertTableArgs {
  documentId: string;
  rows: number;
  columns: number;
  /** 0-based index where the table is inserted (a newline is added before it). */
  index: number;
}

/** Insert an empty table at a model index. */
export async function insertTable(
  client: Auth.OAuth2Client,
  { documentId, rows, columns, index }: InsertTableArgs,
): Promise<{ inserted: boolean }> {
  await batchUpdateDocument(client, {
    documentId,
    requests: [{ insertTable: { rows, columns, location: { index } } }],
  });
  return { inserted: true };
}

export interface InsertInlineImageArgs {
  documentId: string;
  /** Publicly accessible PNG/JPEG/GIF URI (< 50MB, <= 25MP). */
  uri: string;
  /** 0-based index inside an existing paragraph. */
  index: number;
}

/** Insert an inline image and return the created object id. */
export async function insertInlineImage(
  client: Auth.OAuth2Client,
  { documentId, uri, index }: InsertInlineImageArgs,
): Promise<{ objectId?: string | null }> {
  const res = await batchUpdateDocument(client, {
    documentId,
    requests: [{ insertInlineImage: { uri, location: { index } } }],
  });
  return res.replies?.[0]?.insertInlineImage ?? { objectId: undefined };
}

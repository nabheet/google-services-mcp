import { describe, expect, it, vi, beforeEach } from "vitest";
import { google } from "googleapis";

const mockDocs = {
  documents: {
    get: vi.fn(),
    create: vi.fn(),
    batchUpdate: vi.fn(),
  },
};

vi.mock("googleapis", () => ({
  google: {
    docs: vi.fn(() => mockDocs),
  },
}));

const client = {} as never;

import {
  getDocument,
  getDocumentText,
  createDocument,
  insertText,
  replaceAllText,
  batchUpdateDocument,
} from "../src/services/docs.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("docs service", () => {
  it("getDocument returns the raw document", async () => {
    mockDocs.documents.get.mockResolvedValue({ data: { documentId: "d1", title: "Doc" } });
    const result = await getDocument(client, { documentId: "d1" });
    expect(result.title).toBe("Doc");
    expect(mockDocs.documents.get).toHaveBeenCalledWith({ documentId: "d1" });
  });

  it("getDocumentText extracts plain text from body content", async () => {
    mockDocs.documents.get.mockResolvedValue({
      data: {
        documentId: "d1",
        body: {
          content: [
            { paragraph: { elements: [{ textRun: { content: "Hello " } }, { textRun: { content: "world" } }] } },
            { paragraph: { elements: [{ textRun: { content: "Line two" } }] } },
            { table: { rows: [] } },
          ],
        },
      },
    });
    const result = await getDocumentText(client, { documentId: "d1" });
    expect(result).toBe("Hello world\nLine two\n");
  });

  it("getDocumentText returns empty string for empty body", async () => {
    mockDocs.documents.get.mockResolvedValue({ data: { documentId: "d1", body: { content: [] } } });
    const result = await getDocumentText(client, { documentId: "d1" });
    expect(result).toBe("");
  });

  it("createDocument creates with title", async () => {
    mockDocs.documents.create.mockResolvedValue({ data: { documentId: "d2", title: "New doc" } });
    const result = await createDocument(client, { title: "New doc" });
    expect(result.documentId).toBe("d2");
    expect(mockDocs.documents.create).toHaveBeenCalledWith({
      requestBody: { title: "New doc" },
    });
  });

  it("insertText appends text at the document end", async () => {
    mockDocs.documents.get.mockResolvedValue({ data: { documentId: "d1", body: { content: [{ endIndex: 5 }] } } });
    mockDocs.documents.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    const result = await insertText(client, { documentId: "d1", text: "More text" });
    expect(result).toEqual({ inserted: true });
    const body = mockDocs.documents.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].insertText).toEqual({ endOfSegmentLocation: {}, text: "More text" });
  });

  it("insertText uses explicit index when provided", async () => {
    mockDocs.documents.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    await insertText(client, { documentId: "d1", text: "X", index: 10 });
    const body = mockDocs.documents.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].insertText).toEqual({ location: { index: 10 }, text: "X" });
  });

  it("replaceAllText replaces across the document", async () => {
    mockDocs.documents.batchUpdate.mockResolvedValue({
      data: { replies: [{ replaceAllText: { occurrencesChanged: 2 } }] },
    });
    const result = await replaceAllText(client, { documentId: "d1", find: "{{name}}", replace: "Nabheet" });
    expect(result.occurrencesChanged).toBe(2);
    const body = mockDocs.documents.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].replaceAllText).toEqual({
      containsText: { text: "{{name}}", matchCase: true },
      replaceText: "Nabheet",
    });
  });

  it("batchUpdateDocument sends raw requests", async () => {
    mockDocs.documents.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    const requests = [{ deleteContentRange: { range: { startIndex: 0, endIndex: 5 } } }];
    const result = await batchUpdateDocument(client, { documentId: "d1", requests });
    expect(result.replies).toEqual([]);
    expect(mockDocs.documents.batchUpdate).toHaveBeenCalledWith({
      documentId: "d1",
      requestBody: { requests },
    });
  });

  it("propagates API errors", async () => {
    mockDocs.documents.get.mockRejectedValue(new Error("not found"));
    await expect(getDocument(client, { documentId: "nope" })).rejects.toThrow("not found");
  });
});

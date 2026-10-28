import { beforeEach, describe, expect, it, vi } from "vitest";

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
  batchUpdateDocument,
  createDocument,
  deleteRange,
  getDocument,
  getDocumentText,
  insertInlineImage,
  insertTable,
  insertText,
  replaceAllText,
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
            {
              paragraph: {
                elements: [{ textRun: { content: "Hello " } }, { textRun: { content: "world" } }],
              },
            },
            { paragraph: { elements: [{ textRun: { content: "Line two" } }] } },
            {
              table: {
                tableRows: [
                  {
                    tableCells: [
                      {
                        content: [
                          { paragraph: { elements: [{ textRun: { content: "Cell A\n" } }] } },
                        ],
                      },
                      {
                        content: [
                          { paragraph: { elements: [{ textRun: { content: "Cell B\n" } }] } },
                        ],
                      },
                    ],
                  },
                  {
                    tableCells: [
                      {
                        content: [
                          { paragraph: { elements: [{ textRun: { content: "Cell C\n" } }] } },
                        ],
                      },
                      {
                        content: [
                          {
                            table: {
                              tableRows: [
                                {
                                  tableCells: [
                                    {
                                      content: [
                                        {
                                          paragraph: {
                                            elements: [{ textRun: { content: "Nested\n" } }],
                                          },
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    });
    const result = await getDocumentText(client, { documentId: "d1" });
    expect(result).toBe("Hello world\nLine two\nCell A\tCell B\nCell C\tNested\n");
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
    mockDocs.documents.get.mockResolvedValue({
      data: { documentId: "d1", body: { content: [{ endIndex: 5 }] } },
    });
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
    const result = await replaceAllText(client, {
      documentId: "d1",
      find: "{{name}}",
      replace: "Ada",
    });
    expect(result.occurrencesChanged).toBe(2);
    const body = mockDocs.documents.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].replaceAllText).toEqual({
      containsText: { text: "{{name}}", matchCase: true },
      replaceText: "Ada",
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

  it("deleteRange sends a deleteContentRange request", async () => {
    mockDocs.documents.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    const result = await deleteRange(client, { documentId: "d1", startIndex: 3, endIndex: 10 });
    expect(result.deleted).toBe(true);
    expect(mockDocs.documents.batchUpdate).toHaveBeenCalledWith({
      documentId: "d1",
      requestBody: {
        requests: [{ deleteContentRange: { range: { startIndex: 3, endIndex: 10 } } }],
      },
    });
  });

  it("insertTable sends an insertTable request with location", async () => {
    mockDocs.documents.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    const result = await insertTable(client, { documentId: "d1", rows: 2, columns: 3, index: 5 });
    expect(result.inserted).toBe(true);
    expect(mockDocs.documents.batchUpdate).toHaveBeenCalledWith({
      documentId: "d1",
      requestBody: {
        requests: [{ insertTable: { rows: 2, columns: 3, location: { index: 5 } } }],
      },
    });
  });

  it("insertInlineImage returns the created object id", async () => {
    mockDocs.documents.batchUpdate.mockResolvedValue({
      data: { replies: [{ insertInlineImage: { objectId: "kix.abc123" } }] },
    });
    const result = await insertInlineImage(client, {
      documentId: "d1",
      uri: "https://example.com/img.png",
      index: 7,
    });
    expect(result.objectId).toBe("kix.abc123");
    expect(mockDocs.documents.batchUpdate).toHaveBeenCalledWith({
      documentId: "d1",
      requestBody: {
        requests: [
          { insertInlineImage: { uri: "https://example.com/img.png", location: { index: 7 } } },
        ],
      },
    });
  });

  it("propagates API errors", async () => {
    mockDocs.documents.get.mockRejectedValue(new Error("not found"));
    await expect(getDocument(client, { documentId: "nope" })).rejects.toThrow("not found");
  });
});

describe("docs index validation", () => {
  it("rejects insertText at index 0", async () => {
    await expect(insertText(client, { documentId: "d1", text: "X", index: 0 })).rejects.toThrow(
      /1-based/,
    );
    expect(mockDocs.documents.batchUpdate).not.toHaveBeenCalled();
  });

  it("rejects insertTable at index 0", async () => {
    await expect(
      insertTable(client, { documentId: "d1", rows: 1, columns: 1, index: 0 }),
    ).rejects.toThrow(/1-based/);
    expect(mockDocs.documents.batchUpdate).not.toHaveBeenCalled();
  });

  it("rejects insertInlineImage at index 0", async () => {
    await expect(
      insertInlineImage(client, { documentId: "d1", uri: "https://example.com/i.png", index: 0 }),
    ).rejects.toThrow(/1-based/);
  });

  it("rejects a delete range that starts at 0 or ends before it starts", async () => {
    await expect(
      deleteRange(client, { documentId: "d1", startIndex: 0, endIndex: 5 }),
    ).rejects.toThrow(/1-based/);
    await expect(
      deleteRange(client, { documentId: "d1", startIndex: 8, endIndex: 8 }),
    ).rejects.toThrow(/endIndex/);
    expect(mockDocs.documents.batchUpdate).not.toHaveBeenCalled();
  });

  it("rejects a fractional index", async () => {
    await expect(insertText(client, { documentId: "d1", text: "X", index: 2.5 })).rejects.toThrow(
      /1-based/,
    );
  });
});

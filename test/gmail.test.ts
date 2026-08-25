import { describe, expect, it, vi, beforeEach } from "vitest";

const mockMessages = {
  send: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  modify: vi.fn(),
  trash: vi.fn(),
  untrash: vi.fn(),
  delete: vi.fn(),
  attachments: { get: vi.fn() },
};
const mockDrafts = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  send: vi.fn(),
  delete: vi.fn(),
};
const mockLabels = {
  list: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({ users: { messages: mockMessages, drafts: mockDrafts, labels: mockLabels } })),
  },
}));

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
} from "../src/services/gmail.js";

const client = {} as never;

function decodeRaw(base64url: string): string {
  return Buffer.from(base64url, "base64url").toString("utf8");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendGmail", () => {
  it("sends a base64url-encoded RFC2822 message to me", async () => {
    mockMessages.send.mockResolvedValue({ data: { id: "msg-1", threadId: "thr-1" } });
    const result = await sendGmail(client, {
      to: "bob@example.com",
      subject: "Hello",
      body: "Hi Bob",
    });
    expect(mockMessages.send).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { raw: expect.any(String) },
    });
    const raw = decodeRaw(mockMessages.send.mock.calls[0][0].requestBody.raw);
    expect(raw).toContain("To: bob@example.com");
    expect(raw).toContain("Subject: Hello");
    expect(raw).toContain("Hi Bob");
    expect(result).toEqual({ id: "msg-1", threadId: "thr-1" });
  });

  it("supports cc, bcc, html body and multiple recipients", async () => {
    mockMessages.send.mockResolvedValue({ data: { id: "m2" } });
    await sendGmail(client, {
      to: ["a@example.com", "b@example.com"],
      cc: "c@example.com",
      bcc: "d@example.com",
      subject: "S",
      body: "<b>Bold</b>",
      bodyType: "html",
    });
    const raw = decodeRaw(mockMessages.send.mock.calls[0][0].requestBody.raw);
    expect(raw).toContain("To: a@example.com, b@example.com");
    expect(raw).toContain("Cc: c@example.com");
    expect(raw).toContain("Bcc: d@example.com");
    expect(raw).toContain("Content-Type: text/html");
    expect(raw).toContain("<b>Bold</b>");
  });

  it("throws a helpful error when no recipient is given", async () => {
    await expect(sendGmail(client, { to: "", subject: "S", body: "B" })).rejects.toThrow(/recipient/i);
  });

  it("throws when subject and body are both empty", async () => {
    await expect(sendGmail(client, { to: "bob@example.com", subject: "", body: "" })).rejects.toThrow(/subject.*body/i);
  });
});

describe("listGmailMessages", () => {
  it("passes query and maxResults and maps results", async () => {
    mockMessages.list.mockResolvedValue({
      data: {
        messages: [
          { id: "m1", threadId: "t1", snippet: "hello" },
          { id: "m2", threadId: "t2", snippet: "world" },
        ],
      },
    });
    const result = await listGmailMessages(client, { query: "from:bob", maxResults: 5 });
    expect(mockMessages.list).toHaveBeenCalledWith({
      userId: "me",
      q: "from:bob",
      maxResults: 5,
    });
    expect(result).toEqual([
      { id: "m1", threadId: "t1", snippet: "hello" },
      { id: "m2", threadId: "t2", snippet: "world" },
    ]);
  });

  it("returns an empty list when no messages exist", async () => {
    mockMessages.list.mockResolvedValue({ data: {} });
    const result = await listGmailMessages(client, {});
    expect(result).toEqual([]);
  });
});

describe("getGmailMessage", () => {
  const fullMessage = {
    data: {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "hi",
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "Bob <bob@example.com>" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: "Hello" },
          { name: "Date", value: "Tue, 14 Nov 2023 10:00:00 +0000" },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from("plain body").toString("base64url") },
      },
    },
  };

  it("parses headers and decodes a simple body", async () => {
    mockMessages.get.mockResolvedValue(fullMessage);
    const result = await getGmailMessage(client, { id: "m1" });
    expect(mockMessages.get).toHaveBeenCalledWith({ userId: "me", id: "m1", format: "full" });
    expect(result).toMatchObject({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      from: "Bob <bob@example.com>",
      to: "me@example.com",
      subject: "Hello",
      date: "Tue, 14 Nov 2023 10:00:00 +0000",
      body: "plain body",
    });
  });

  it("extracts text/plain from multipart parts", async () => {
    mockMessages.get.mockResolvedValue({
      data: {
        ...fullMessage.data,
        payload: {
          headers: [{ name: "Subject", value: "Multipart" }],
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/html",
              body: { data: Buffer.from("<p>html</p>").toString("base64url") },
            },
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("plain part").toString("base64url") },
            },
          ],
        },
      },
    });
    const result = await getGmailMessage(client, { id: "m1" });
    expect(result.body).toBe("plain part");
  });
});

describe("modifyGmailMessage", () => {
  it("applies add/remove labels", async () => {
    mockMessages.modify.mockResolvedValue({ data: { id: "m1", labelIds: ["INBOX"] } });
    const result = await modifyGmailMessage(client, { id: "m1", addLabels: ["STARRED"], removeLabels: ["UNREAD"] });
    expect(mockMessages.modify).toHaveBeenCalledWith({
      userId: "me",
      id: "m1",
      requestBody: { addLabelIds: ["STARRED"], removeLabelIds: ["UNREAD"] },
    });
    expect(result.labelIds).toEqual(["INBOX"]);
  });
});

describe("replyGmail", () => {
  it("fetches the original, builds a Re: message and sends in the same thread", async () => {
    mockMessages.get.mockResolvedValue({
      data: {
        id: "orig-1",
        payload: {
          headers: [
            { name: "From", value: "Bob <bob@example.com>" },
            { name: "Subject", value: "Meeting" },
            { name: "Message-ID", value: "<abc@mail.gmail.com>" },
            { name: "References", value: "<prev@mail.gmail.com>" },
          ],
        },
      },
    });
    mockMessages.send.mockResolvedValue({ data: { id: "r1", threadId: "thr-1" } });

    const result = await replyGmail(client, { threadId: "thr-1", messageId: "orig-1", body: "Sure, see you." });

    expect(mockMessages.get).toHaveBeenCalledWith({ userId: "me", id: "orig-1" });
    expect(mockMessages.send).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { raw: expect.any(String), threadId: "thr-1" },
    });
    const raw = decodeRaw(mockMessages.send.mock.calls[0][0].requestBody.raw);
    expect(raw).toContain("To: Bob <bob@example.com>");
    expect(raw).toContain("Subject: Re: Meeting");
    expect(raw).toContain('In-Reply-To: <abc@mail.gmail.com>');
    expect(raw).toContain("References: <prev@mail.gmail.com>");
    expect(raw).toContain("Sure, see you.");
    expect(result).toEqual({ id: "r1", threadId: "thr-1" });
  });
});

describe("listGmailAttachments", () => {
  it("collects attachment parts from the payload tree", async () => {
    mockMessages.get.mockResolvedValue({
      data: {
        payload: {
          mimeType: "multipart/mixed",
          parts: [
            { mimeType: "text/plain", body: { data: "aGVsbG8=" } },
            {
              partId: "0.1",
              filename: "skills.md",
              mimeType: "text/markdown",
              body: { attachmentId: "ATT1", size: 123 },
            },
            {
              partId: "0.2",
              filename: "photo.png",
              mimeType: "image/png",
              body: { attachmentId: "ATT2", size: 456 },
            },
          ],
        },
      },
    });
    const result = await listGmailAttachments(client, { id: "m1" });
    expect(result).toEqual([
      { id: "ATT1", partId: "0.1", filename: "skills.md", mimeType: "text/markdown", size: 123 },
      { id: "ATT2", partId: "0.2", filename: "photo.png", mimeType: "image/png", size: 456 },
    ]);
  });
});

describe("getGmailAttachment", () => {
  it("returns decoded text for text-like mime types", async () => {
    mockMessages.get.mockResolvedValue({
      data: {
        payload: {
          parts: [
            {
              partId: "0.1",
              filename: "skills.md",
              mimeType: "text/markdown",
              body: { attachmentId: "ATT1", size: 5 },
            },
          ],
        },
      },
    });
    mockMessages.attachments.get.mockResolvedValue({ data: { data: Buffer.from("# Hi").toString("base64url"), size: 5 } });
    const result = await getGmailAttachment(client, { id: "m1", attachmentId: "ATT1" });
    expect(mockMessages.attachments.get).toHaveBeenCalledWith({
      userId: "me",
      messageId: "m1",
      id: "ATT1",
    });
    expect(result).toMatchObject({
      id: "ATT1",
      partId: "0.1",
      filename: "skills.md",
      mimeType: "text/markdown",
      size: 5,
      text: "# Hi",
    });
  });

  it("returns base64 only for binary mime types", async () => {
    mockMessages.get.mockResolvedValue({
      data: { payload: { parts: [{ partId: "0.1", filename: "x.pdf", mimeType: "application/pdf", body: { attachmentId: "ATT9", size: 3 } }] } },
    });
    mockMessages.attachments.get.mockResolvedValue({ data: { data: "aGVsbG8=", size: 3 } });
    const result = await getGmailAttachment(client, { id: "m1", attachmentId: "ATT9" });
    expect(result.text).toBeUndefined();
    expect(result.dataBase64).toBe("aGVsbG8=");
  });

  it("matches by stable partId when attachmentId rotates between calls", async () => {
    // listGmailAttachments returned "STALE"; this fetch has a fresh ID for the same part.
    mockMessages.get.mockResolvedValue({
      data: {
        payload: {
          parts: [
            {
              partId: "0.1",
              filename: "skills.md",
              mimeType: "text/markdown",
              body: { attachmentId: "FRESH", size: 5 },
            },
          ],
        },
      },
    });
    mockMessages.attachments.get.mockResolvedValue({ data: { data: Buffer.from("# Hi").toString("base64url"), size: 5 } });
    const result = await getGmailAttachment(client, { id: "m1", attachmentId: "STALE", partId: "0.1" });
    expect(mockMessages.attachments.get).toHaveBeenCalledWith({ userId: "me", messageId: "m1", id: "FRESH" });
    expect(result).toMatchObject({
      id: "FRESH",
      partId: "0.1",
      filename: "skills.md",
      mimeType: "text/markdown",
      text: "# Hi",
    });
  });

  it("falls back to attachmentId matching when partId is absent", async () => {
    mockMessages.get.mockResolvedValue({
      data: {
        payload: {
          parts: [
            { partId: "0.1", filename: "old.md", mimeType: "text/markdown", body: { attachmentId: "ATT1", size: 3 } },
          ],
        },
      },
    });
    mockMessages.attachments.get.mockResolvedValue({ data: { data: Buffer.from("old").toString("base64url"), size: 3 } });
    const result = await getGmailAttachment(client, { id: "m1", attachmentId: "ATT1" });
    expect(mockMessages.attachments.get).toHaveBeenCalledWith({ userId: "me", messageId: "m1", id: "ATT1" });
    expect(result).toMatchObject({ filename: "old.md", mimeType: "text/markdown", text: "old" });
  });
});

describe("createGmailDraft", () => {
  it("builds a raw message and creates a draft", async () => {
    mockDrafts.create.mockResolvedValue({ data: { id: "d1", message: { id: "m1", threadId: "t1" } } });
    const result = await createGmailDraft(client, {
      to: "bob@example.com",
      subject: "Draft",
      body: "Body",
    });
    const call = mockDrafts.create.mock.calls[0][0];
    expect(call.userId).toBe("me");
    expect(call.requestBody.message.raw).toEqual(expect.any(String));
    const raw = decodeRaw(call.requestBody.message.raw);
    expect(raw).toContain("Subject: Draft");
    expect(result).toEqual({ id: "d1", messageId: "m1", threadId: "t1" });
  });
});

describe("listGmailDrafts", () => {
  it("maps draft summaries", async () => {
    mockDrafts.list.mockResolvedValue({
      data: {
        drafts: [
          { id: "d1", message: { id: "m1", threadId: "t1", snippet: "hi" } },
          { id: "d2", message: { id: "m2" } },
        ],
      },
    });
    const result = await listGmailDrafts(client, { maxResults: 10 });
    expect(mockDrafts.list).toHaveBeenCalledWith({ userId: "me", maxResults: 10 });
    expect(result).toEqual([
      { id: "d1", messageId: "m1", threadId: "t1", snippet: "hi" },
      { id: "d2", messageId: "m2", threadId: undefined, snippet: undefined },
    ]);
  });
});

describe("getGmailDraft", () => {
  it("parses headers and body from a draft message", async () => {
    mockDrafts.get.mockResolvedValue({
      data: {
        id: "d1",
        message: {
          id: "m1",
          threadId: "t1",
          snippet: "s",
          payload: {
            headers: [{ name: "Subject", value: "Draft subject" }],
            body: { data: Buffer.from("draft body").toString("base64url") },
          },
        },
      },
    });
    const result = await getGmailDraft(client, { id: "d1" });
    expect(mockDrafts.get).toHaveBeenCalledWith({ userId: "me", id: "d1", format: "full" });
    expect(result).toMatchObject({ draftId: "d1", id: "m1", subject: "Draft subject", body: "draft body" });
  });
});

describe("sendGmailDraft", () => {
  it("sends an existing draft", async () => {
    mockDrafts.send.mockResolvedValue({ data: { id: "m1", threadId: "t1" } });
    const result = await sendGmailDraft(client, { id: "d1" });
    expect(mockDrafts.send).toHaveBeenCalledWith({ userId: "me", requestBody: { id: "d1" } });
    expect(result).toEqual({ id: "m1", threadId: "t1" });
  });
});

describe("deleteGmailDraft", () => {
  it("deletes a draft", async () => {
    mockDrafts.delete.mockResolvedValue({ data: {} });
    const result = await deleteGmailDraft(client, { id: "d1" });
    expect(mockDrafts.delete).toHaveBeenCalledWith({ userId: "me", id: "d1" });
    expect(result).toEqual({ deleted: true, id: "d1" });
  });
});

describe("gmail labels", () => {
  it("lists labels", async () => {
    mockLabels.list.mockResolvedValue({
      data: { labels: [{ id: "L1", name: "Important", type: "user" }] },
    });
    const result = await listGmailLabels(client);
    expect(mockLabels.list).toHaveBeenCalledWith({ userId: "me" });
    expect(result).toEqual([{ id: "L1", name: "Important", type: "user" }]);
  });

  it("creates a label", async () => {
    mockLabels.create.mockResolvedValue({ data: { id: "L2", name: "Projects" } });
    const result = await createGmailLabel(client, { name: "Projects" });
    expect(mockLabels.create).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { name: "Projects", messageListVisibility: undefined, labelListVisibility: undefined },
    });
    expect(result).toMatchObject({ id: "L2", name: "Projects" });
  });

  it("deletes a label", async () => {
    mockLabels.delete.mockResolvedValue({ data: {} });
    const result = await deleteGmailLabel(client, { id: "L1" });
    expect(mockLabels.delete).toHaveBeenCalledWith({ userId: "me", id: "L1" });
    expect(result).toEqual({ deleted: true, id: "L1" });
  });
});

describe("gmail trash and delete", () => {
  it("trashes a message", async () => {
    mockMessages.trash.mockResolvedValue({ data: { id: "m1", labelIds: ["TRASH"] } });
    const result = await trashGmailMessage(client, { id: "m1" });
    expect(mockMessages.trash).toHaveBeenCalledWith({ userId: "me", id: "m1" });
    expect(result.labelIds).toContain("TRASH");
  });

  it("untrashes a message", async () => {
    mockMessages.untrash.mockResolvedValue({ data: { id: "m1", labelIds: ["INBOX"] } });
    const result = await untrashGmailMessage(client, { id: "m1" });
    expect(mockMessages.untrash).toHaveBeenCalledWith({ userId: "me", id: "m1" });
    expect(result.labelIds).toContain("INBOX");
  });

  it("permanently deletes a message", async () => {
    mockMessages.delete.mockResolvedValue({ data: {} });
    const result = await deleteGmailMessage(client, { id: "m1" });
    expect(mockMessages.delete).toHaveBeenCalledWith({ userId: "me", id: "m1" });
    expect(result).toEqual({ deleted: true, id: "m1" });
  });
});

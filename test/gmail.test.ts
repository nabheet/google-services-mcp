import { describe, expect, it, vi, beforeEach } from "vitest";

const mockMessages = {
  send: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  modify: vi.fn(),
};

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({ users: { messages: mockMessages } })),
  },
}));

import { sendGmail, listGmailMessages, getGmailMessage, modifyGmailMessage, replyGmail } from "../src/services/gmail.js";

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

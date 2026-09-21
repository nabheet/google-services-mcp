import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { getGmailMessage, listGmailMessages, sendGmail } from "../../src/services/gmail.js";
import { cleanup, lockNetwork, makeClient } from "./helpers.js";

/**
 * Hermetic E2E for Gmail: real googleapis request pipeline (OAuth2 client
 * -> gaxios -> node-fetch) intercepted by nock with realistic fixtures.
 * Validates endpoints, query building, and response parsing end to end.
 */

describe("gmail E2E (nock)", () => {
  afterEach(cleanup);

  it("sendGmail POSTs the raw MIME to /gmail/v1/users/me/messages/send", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .post("/gmail/v1/users/me/messages/send", (body) => {
        return (
          typeof (body as { raw: string }).raw === "string" &&
          (body as { raw: string }).raw.length > 0
        );
      })
      .reply(200, { id: "msg-sent-1", threadId: "thr-sent-1" });

    const res = await sendGmail(client, {
      to: "e2e@example.com",
      subject: "E2E send",
      body: "hello from hermetic e2e",
    });

    expect(res).toEqual({ id: "msg-sent-1", threadId: "thr-sent-1" });
    expect(nock.isDone()).toBe(true);
  });

  it("listGmailMessages sends q + maxResults and parses summaries", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .get("/gmail/v1/users/me/messages")
      .query((q) => q.maxResults === "10" && q.q === "from:e2e")
      .reply(200, {
        messages: [
          { id: "m1", threadId: "t1", snippet: "first" },
          { id: "m2", threadId: "t2", snippet: "second" },
        ],
      });

    const res = await listGmailMessages(client, { query: "from:e2e", maxResults: 10 });

    expect(res).toEqual([
      { id: "m1", threadId: "t1", snippet: "first" },
      { id: "m2", threadId: "t2", snippet: "second" },
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it("getGmailMessage parses headers, body and attachment flags from a full message", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .get("/gmail/v1/users/me/messages/msg-1")
      .query((q) => q.format === "full")
      .reply(200, {
        id: "msg-1",
        threadId: "thr-1",
        labelIds: ["INBOX", "UNREAD"],
        snippet: "E2E message",
        payload: {
          mimeType: "multipart/mixed",
          headers: [
            { name: "From", value: "sender@example.com" },
            { name: "To", value: "e2e@example.com" },
            { name: "Subject", value: "E2E subject" },
            { name: "Date", value: "Mon, 21 Sep 2026 12:00:00 +0000" },
          ],
          body: { size: 0 },
          parts: [
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("plain body").toString("base64url") },
            },
            {
              mimeType: "application/pdf",
              filename: "report.pdf",
              body: { size: 1234 },
            },
          ],
        },
      });

    const res = await getGmailMessage(client, { id: "msg-1", format: "full" });

    expect(res.id).toBe("msg-1");
    expect(res.threadId).toBe("thr-1");
    expect(res.labelIds).toEqual(["INBOX", "UNREAD"]);
    expect(res.from).toBe("sender@example.com");
    expect(res.to).toBe("e2e@example.com");
    expect(res.subject).toBe("E2E subject");
    expect(res.date).toContain("Mon, 21 Sep 2026");
    expect(res.body).toContain("plain body");
    expect(res.hasAttachments).toBe(true);
    expect(nock.isDone()).toBe(true);
  });

  it("surfaces API errors from a 4xx response", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .get("/gmail/v1/users/me/messages")
      .query(true)
      .reply(403, {
        error: { code: 403, message: "Access forbidden", status: "PERMISSION_DENIED" },
      });

    await expect(listGmailMessages(client, {})).rejects.toThrow(/403|forbidden|PERMISSION_DENIED/i);
    expect(nock.isDone()).toBe(true);
  });
});

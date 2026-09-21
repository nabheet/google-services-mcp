import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGmailDraft,
  createGmailLabel,
  listGmailDrafts,
  listGmailLabels,
  sendGmailDraft,
} from "../../src/services/gmail.js";
import { cleanup, lockNetwork, makeClient } from "./helpers.js";

/**
 * Hermetic E2E for Gmail drafts + labels: real googleapis request pipeline
 * intercepted by nock.
 */

describe("gmail drafts & labels E2E (nock)", () => {
  afterEach(cleanup);

  it("createGmailDraft POSTs the raw MIME to drafts", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .post("/gmail/v1/users/me/drafts", (body) => {
        return typeof (body as { message?: { raw?: string } }).message?.raw === "string";
      })
      .reply(200, {
        id: "draft-1",
        message: { id: "msg-draft-1", threadId: "thr-draft-1" },
      });

    const res = await createGmailDraft(client, {
      to: "e2e@example.com",
      subject: "E2E draft",
      body: "draft body",
    });

    expect(res.id).toBe("draft-1");
    expect(nock.isDone()).toBe(true);
  });

  it("listGmailDrafts parses draft summaries", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .get("/gmail/v1/users/me/drafts")
      .query(true)
      .reply(200, {
        drafts: [
          { id: "d1", message: { id: "m1", threadId: "t1" } },
          { id: "d2", message: { id: "m2", threadId: "t2" } },
        ],
      });

    const res = await listGmailDrafts(client, {});

    expect(res).toHaveLength(2);
    expect(res[0].id).toBe("d1");
    expect(nock.isDone()).toBe(true);
  });

  it("sendGmailDraft POSTs to drafts/send", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .post("/gmail/v1/users/me/drafts/send", (body) => (body as { id?: string }).id === "draft-1")
      .reply(200, { id: "msg-sent-draft", threadId: "thr-sent-draft" });

    const res = await sendGmailDraft(client, { id: "draft-1" });

    expect(res).toEqual({ id: "msg-sent-draft", threadId: "thr-sent-draft" });
    expect(nock.isDone()).toBe(true);
  });

  it("listGmailLabels parses label list", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .get("/gmail/v1/users/me/labels")
      .reply(200, {
        labels: [
          { id: "INBOX", name: "INBOX", type: "system" },
          { id: "LABEL_1", name: "Projects", type: "user" },
        ],
      });

    const res = await listGmailLabels(client);

    expect(res).toHaveLength(2);
    expect(res[1]).toMatchObject({ id: "LABEL_1", name: "Projects", type: "user" });
    expect(nock.isDone()).toBe(true);
  });

  it("createGmailLabel POSTs a label with visibility config", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://gmail.googleapis.com")
      .post("/gmail/v1/users/me/labels", (body) => {
        const b = body as {
          name?: string;
          labelListVisibility?: string;
          messageListVisibility?: string;
        };
        return b.name === "Archive" && b.labelListVisibility === "labelShow";
      })
      .reply(200, { id: "LABEL_NEW", name: "Archive", type: "user" });

    const res = await createGmailLabel(client, {
      name: "Archive",
      labelListVisibility: "labelShow",
    });

    expect(res.id).toBe("LABEL_NEW");
    expect(nock.isDone()).toBe(true);
  });
});

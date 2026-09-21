import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import {
  downloadDriveFile,
  getDriveFile,
  listDriveFiles,
  uploadDriveFile,
} from "../../src/services/drive.js";
import { cleanup, lockNetwork, makeClient } from "./helpers.js";

/**
 * Hermetic E2E for Drive: real googleapis request pipeline intercepted by
 * nock. Validates files.list/get/create and binary download.
 */

describe("drive E2E (nock)", () => {
  afterEach(cleanup);

  it("listDriveFiles sends fields/orderBy and parses file metadata", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com")
      .get("/drive/v3/files")
      .query((q) => q.pageSize === "25" && q.orderBy === "modifiedTime desc")
      .reply(200, {
        files: [
          {
            id: "f1",
            name: "report.pdf",
            mimeType: "application/pdf",
            size: "2048",
            createdTime: "2026-09-01T00:00:00Z",
            modifiedTime: "2026-09-20T00:00:00Z",
            webViewLink: "https://drive.google.com/file/d/f1/view",
          },
        ],
      });

    const res = await listDriveFiles(client, {});

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: "f1",
      name: "report.pdf",
      mimeType: "application/pdf",
    });
    expect(nock.isDone()).toBe(true);
  });

  it("getDriveFile fetches metadata for a single file", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com").get("/drive/v3/files/f1").query(true).reply(200, {
      id: "f1",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: "2048",
      createdTime: "2026-09-01T00:00:00Z",
      modifiedTime: "2026-09-20T00:00:00Z",
      webViewLink: "https://drive.google.com/file/d/f1/view",
    });

    const res = await getDriveFile(client, { fileId: "f1" });

    expect(res.id).toBe("f1");
    expect(res.name).toBe("report.pdf");
    expect(nock.isDone()).toBe(true);
  });

  it("uploadDriveFile uses the multipart upload endpoint when content is present", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com")
      .post("/upload/drive/v3/files", (body) => {
        // multipart body: first part carries the metadata JSON
        const b = String(body);
        return b.includes('"name":"notes.txt"') && b.includes("hello");
      })
      .query({ uploadType: "multipart" })
      .reply(200, {
        id: "f-new",
        name: "notes.txt",
        mimeType: "text/plain",
        createdTime: "2026-09-21T00:00:00Z",
        modifiedTime: "2026-09-21T00:00:00Z",
      });

    const res = await uploadDriveFile(client, {
      name: "notes.txt",
      mimeType: "text/plain",
      content: "hello",
    });

    expect(res.id).toBe("f-new");
    expect(res.name).toBe("notes.txt");
    expect(nock.isDone()).toBe(true);
  });

  it("downloadDriveFile returns base64-encoded binary bytes", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com")
      .get("/drive/v3/files/f1")
      .query((q) => q.alt === "media")
      .reply(200, Buffer.from([1, 2, 3, 4]), {
        "Content-Type": "application/octet-stream",
      });

    const res = await downloadDriveFile(client, { fileId: "f1" });

    expect(res.binary).toBe(true);
    expect(res.data).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    expect(nock.isDone()).toBe(true);
  });
});

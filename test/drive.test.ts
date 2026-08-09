import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFiles = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockPermissions = { create: vi.fn(), delete: vi.fn() };

vi.mock("googleapis", () => ({
  google: {
    drive: vi.fn(() => ({ files: mockFiles, permissions: mockPermissions })),
  },
}));

import {
  listDriveFiles,
  getDriveFile,
  uploadDriveFile,
  updateDriveFile,
  deleteDriveFile,
  shareDriveFile,
} from "../src/services/drive.js";

const client = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDriveFiles", () => {
  it("lists files with default fields", async () => {
    mockFiles.list.mockResolvedValue({
      data: {
        files: [
          { id: "f1", name: "notes.md", mimeType: "text/markdown" },
          { id: "f2", name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet" },
        ],
      },
    });
    const result = await listDriveFiles(client, {});
    expect(mockFiles.list).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 25, orderBy: "modifiedTime desc", fields: expect.stringContaining("id") })
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "f1", name: "notes.md" });
  });

  it("supports a folder filter via query", async () => {
    mockFiles.list.mockResolvedValue({ data: {} });
    await listDriveFiles(client, { query: "'0Bx' in parents" });
    expect(mockFiles.list).toHaveBeenCalledWith(expect.objectContaining({ q: "'0Bx' in parents" }));
  });
});

describe("getDriveFile", () => {
  it("fetches file metadata", async () => {
    mockFiles.get.mockResolvedValue({ data: { id: "f1", name: "notes.md", mimeType: "text/markdown", size: "1024" } });
    const result = await getDriveFile(client, { fileId: "f1" });
    expect(mockFiles.get).toHaveBeenCalledWith(expect.objectContaining({ fileId: "f1" }));
    expect(result).toMatchObject({ id: "f1", name: "notes.md" });
  });
});

describe("uploadDriveFile", () => {
  it("creates a new file with name, mimeType and content", async () => {
    mockFiles.create.mockResolvedValue({ data: { id: "f-new", name: "hello.txt" } });
    const result = await uploadDriveFile(client, { name: "hello.txt", mimeType: "text/plain", content: "hello world" });
    const call = mockFiles.create.mock.calls[0][0];
    expect(call.requestBody).toMatchObject({ name: "hello.txt", mimeType: "text/plain" });
    expect(call.media).toEqual({ mimeType: "text/plain", body: "hello world" });
    expect(result.id).toBe("f-new");
  });

  it("creates a blank Google Doc when no content is provided", async () => {
    mockFiles.create.mockResolvedValue({ data: { id: "f-doc" } });
    await uploadDriveFile(client, { name: "Doc", mimeType: "application/vnd.google-apps.document" });
    expect(mockFiles.create.mock.calls[0][0].requestBody.mimeType).toBe("application/vnd.google-apps.document");
    expect(mockFiles.create.mock.calls[0][0].media).toBeUndefined();
  });
});

describe("updateDriveFile", () => {
  it("renames a file", async () => {
    mockFiles.update.mockResolvedValue({ data: { id: "f1", name: "renamed.md" } });
    const result = await updateDriveFile(client, { fileId: "f1", name: "renamed.md" });
    expect(mockFiles.update).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1", requestBody: { name: "renamed.md" } })
    );
    expect(result.name).toBe("renamed.md");
  });
});

describe("deleteDriveFile", () => {
  it("deletes a file", async () => {
    mockFiles.delete.mockResolvedValue({ data: {} });
    await deleteDriveFile(client, { fileId: "f1" });
    expect(mockFiles.delete).toHaveBeenCalledWith({ fileId: "f1" });
  });
});

describe("shareDriveFile", () => {
  it("creates a permission with a role and type", async () => {
    mockPermissions.create.mockResolvedValue({ data: { id: "perm-1" } });
    const result = await shareDriveFile(client, { fileId: "f1", email: "__VG_EMAIL_b3e8b64ce83f__", role: "reader" });
    expect(mockPermissions.create).toHaveBeenCalledWith({
      fileId: "f1",
      requestBody: { type: "user", role: "reader", emailAddress: "__VG_EMAIL_b3e8b64ce83f__" },
      sendNotificationEmail: true,
    });
    expect(result.id).toBe("perm-1");
  });

  it("sends an email notification by default", async () => {
    mockPermissions.create.mockResolvedValue({ data: {} });
    await shareDriveFile(client, { fileId: "f1", email: "__VG_EMAIL_b3e8b64ce83f__", role: "writer" });
    expect(mockPermissions.create.mock.calls[0][0].sendNotificationEmail).toBe(true);
  });
});

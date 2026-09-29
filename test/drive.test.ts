import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  copy: vi.fn(),
  export: vi.fn(),
};
const mockPermissions = { create: vi.fn(), list: vi.fn(), delete: vi.fn() };
const mockFs = vi.hoisted(() => ({
  writeFile: vi.fn(),
}));
const mockNodeFs = vi.hoisted(() => ({
  createReadStream: vi.fn(),
}));

vi.mock("node:fs/promises", () => mockFs);
vi.mock("node:fs", () => mockNodeFs);

vi.mock("googleapis", () => ({
  google: {
    drive: vi.fn(() => ({ files: mockFiles, permissions: mockPermissions })),
  },
}));

import {
  copyDriveFile,
  createDriveFolder,
  deleteDriveFile,
  deleteDrivePermission,
  downloadDriveFile,
  exportDriveFile,
  getDriveFile,
  listDriveFiles,
  listDrivePermissions,
  moveDriveFile,
  shareDriveFile,
  updateDriveFile,
  uploadDriveFile,
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
      expect.objectContaining({
        pageSize: 25,
        orderBy: "modifiedTime desc",
        fields: expect.stringContaining("id"),
      }),
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
    mockFiles.get.mockResolvedValue({
      data: { id: "f1", name: "notes.md", mimeType: "text/markdown", size: "1024" },
    });
    const result = await getDriveFile(client, { fileId: "f1" });
    expect(mockFiles.get).toHaveBeenCalledWith(expect.objectContaining({ fileId: "f1" }));
    expect(result).toMatchObject({ id: "f1", name: "notes.md" });
  });
});

describe("uploadDriveFile", () => {
  it("creates a new file with name, mimeType and content", async () => {
    mockFiles.create.mockResolvedValue({ data: { id: "f-new", name: "hello.txt" } });
    const result = await uploadDriveFile(client, {
      name: "hello.txt",
      mimeType: "text/plain",
      content: "hello world",
    });
    const call = mockFiles.create.mock.calls[0][0];
    expect(call.requestBody).toMatchObject({ name: "hello.txt", mimeType: "text/plain" });
    expect(call.media).toEqual({ mimeType: "text/plain", body: "hello world" });
    expect(result.id).toBe("f-new");
  });

  it("creates a blank Google Doc when no content is provided", async () => {
    mockFiles.create.mockResolvedValue({ data: { id: "f-doc" } });
    await uploadDriveFile(client, {
      name: "Doc",
      mimeType: "application/vnd.google-apps.document",
    });
    expect(mockFiles.create.mock.calls[0][0].requestBody.mimeType).toBe(
      "application/vnd.google-apps.document",
    );
    expect(mockFiles.create.mock.calls[0][0].media).toBeUndefined();
  });

  it("uploads a local file by path (binary-safe)", async () => {
    mockFiles.create.mockResolvedValue({ data: { id: "f-bin", name: "img.png" } });
    const stream = { pipe: vi.fn() };
    mockNodeFs.createReadStream.mockReturnValue(stream);
    const result = await uploadDriveFile(client, {
      name: "img.png",
      mimeType: "image/png",
      path: "/tmp/img.png",
    });
    expect(mockNodeFs.createReadStream).toHaveBeenCalledWith("/tmp/img.png");
    const call = mockFiles.create.mock.calls[0][0];
    expect(call.media).toEqual({ mimeType: "image/png", body: stream });
    expect(result.id).toBe("f-bin");
  });
});

describe("updateDriveFile", () => {
  it("renames a file", async () => {
    mockFiles.update.mockResolvedValue({ data: { id: "f1", name: "renamed.md" } });
    const result = await updateDriveFile(client, { fileId: "f1", name: "renamed.md" });
    expect(mockFiles.update).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1", requestBody: { name: "renamed.md" } }),
    );
    expect(result.name).toBe("renamed.md");
  });

  it("replaces content from a local file path (binary-safe)", async () => {
    mockFiles.update.mockResolvedValue({ data: { id: "f1", name: "data.bin" } });
    const stream = { pipe: vi.fn() };
    mockNodeFs.createReadStream.mockReturnValue(stream);
    const result = await updateDriveFile(client, {
      fileId: "f1",
      mimeType: "application/octet-stream",
      path: "/tmp/data.bin",
    });
    expect(mockNodeFs.createReadStream).toHaveBeenCalledWith("/tmp/data.bin");
    expect(mockFiles.update).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "f1",
        media: { mimeType: "application/octet-stream", body: stream },
      }),
    );
    expect(result.name).toBe("data.bin");
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
    const result = await shareDriveFile(client, {
      fileId: "f1",
      email: "__VG_EMAIL_b3e8b64ce83f__",
      role: "reader",
    });
    expect(mockPermissions.create).toHaveBeenCalledWith({
      fileId: "f1",
      requestBody: { type: "user", role: "reader", emailAddress: "__VG_EMAIL_b3e8b64ce83f__" },
      sendNotificationEmail: true,
    });
    expect(result.id).toBe("perm-1");
  });

  it("sends an email notification by default", async () => {
    mockPermissions.create.mockResolvedValue({ data: {} });
    await shareDriveFile(client, {
      fileId: "f1",
      email: "__VG_EMAIL_b3e8b64ce83f__",
      role: "writer",
    });
    expect(mockPermissions.create.mock.calls[0][0].sendNotificationEmail).toBe(true);
  });
});

describe("moveDriveFile", () => {
  it("moves a file into a new parent folder", async () => {
    mockFiles.update.mockResolvedValue({
      data: { id: "f1", name: "notes.md", parents: ["fld2"] },
    });
    const result = await moveDriveFile(client, {
      fileId: "f1",
      parentFolderId: "fld2",
      removeParentFolderId: "fld1",
    });
    expect(mockFiles.update).toHaveBeenCalledWith({
      fileId: "f1",
      addParents: "fld2",
      removeParents: "fld1",
      fields: expect.stringContaining("parents"),
    });
    expect(result).toMatchObject({ id: "f1", name: "notes.md" });
  });

  it("adds to a folder without removing existing parents when no removeParentFolderId given", async () => {
    mockFiles.update.mockResolvedValue({
      data: { id: "f1", name: "notes.md", parents: ["fld1", "fld2"] },
    });
    const result = await moveDriveFile(client, { fileId: "f1", parentFolderId: "fld2" });
    expect(mockFiles.update).toHaveBeenCalledWith({
      fileId: "f1",
      addParents: "fld2",
      fields: expect.stringContaining("parents"),
    });
    expect(result).toMatchObject({ id: "f1" });
  });

  it("maps the resulting file with parents", async () => {
    mockFiles.update.mockResolvedValue({
      data: {
        id: "f1",
        name: "notes.md",
        parents: ["fld2"],
        webViewLink: "https://drive.google.com/f1",
      },
    });
    const result = await moveDriveFile(client, {
      fileId: "f1",
      parentFolderId: "fld2",
      removeParentFolderId: "fld1",
    });
    expect(result).toMatchObject({
      id: "f1",
      name: "notes.md",
      webViewLink: "https://drive.google.com/f1",
    });
  });
});

describe("downloadDriveFile", () => {
  it("returns decoded text for text responses", async () => {
    mockFiles.get.mockResolvedValue({ data: "plain file content" });
    const result = await downloadDriveFile(client, { fileId: "f1" });
    expect(mockFiles.get).toHaveBeenCalledWith({ fileId: "f1", alt: "media" });
    expect(result).toEqual({ data: "plain file content", binary: false });
  });

  it("returns base64 for binary responses", async () => {
    mockFiles.get.mockResolvedValue({ data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
    const result = await downloadDriveFile(client, { fileId: "f1" });
    expect(result.binary).toBe(true);
    expect(Buffer.from(result.data, "base64")).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("converts Blob responses to base64 (real googleapis shape)", async () => {
    mockFiles.get.mockResolvedValue({ data: new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])]) });
    const result = await downloadDriveFile(client, { fileId: "f1" });
    expect(result.binary).toBe(true);
    expect(Buffer.from(result.data, "base64")).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("converts foreign Blob (not instanceof global Blob) like googleapis' bundled fetch", async () => {
    // googleapis' gaxios returns a Blob from its own bundled fetch impl, which
    // is NOT an instanceof the global Blob class. Duck-type it via arrayBuffer().
    const foreignBlob = {
      size: 4,
      type: "application/octet-stream",
      arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    };
    mockFiles.get.mockResolvedValue({ data: foreignBlob });
    const result = await downloadDriveFile(client, { fileId: "f1" });
    expect(result.binary).toBe(true);
    expect(Buffer.from(result.data, "base64")).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("writes binary bytes to a local path when saveToPath is set", async () => {
    mockFiles.get.mockResolvedValue({ data: new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])]) });
    const result = await downloadDriveFile(client, { fileId: "f1", saveToPath: "/tmp/out.png" });
    expect(mockFiles.get).toHaveBeenCalledWith({ fileId: "f1", alt: "media" });
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      "/tmp/out.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(result).toEqual({ savedTo: "/tmp/out.png" });
  });

  it("writes text to a local path when saveToPath is set", async () => {
    mockFiles.get.mockResolvedValue({ data: "plain file content" });
    const result = await downloadDriveFile(client, { fileId: "f1", saveToPath: "/tmp/out.txt" });
    expect(mockFs.writeFile).toHaveBeenCalledWith("/tmp/out.txt", "plain file content");
    expect(result).toEqual({ savedTo: "/tmp/out.txt" });
  });
});

describe("exportDriveFile", () => {
  it("requests a target mime type export", async () => {
    mockFiles.export.mockResolvedValue({ data: "%PDF-1.4" });
    const result = await exportDriveFile(client, { fileId: "f1", mimeType: "application/pdf" });
    expect(mockFiles.export).toHaveBeenCalledWith({ fileId: "f1", mimeType: "application/pdf" });
    expect(result).toEqual({ data: "%PDF-1.4", binary: false });
  });

  it("converts Blob export responses to base64 (real googleapis shape)", async () => {
    mockFiles.export.mockResolvedValue({ data: new Blob([Buffer.from("%PDF-1.4 fake")]) });
    const result = await exportDriveFile(client, { fileId: "f1", mimeType: "application/pdf" });
    expect(result.binary).toBe(true);
    expect(Buffer.from(result.data, "base64").toString()).toBe("%PDF-1.4 fake");
  });
});

describe("createDriveFolder", () => {
  it("creates a folder with the right mime type", async () => {
    mockFiles.create.mockResolvedValue({
      data: { id: "fld1", name: "Reports", mimeType: "application/vnd.google-apps.folder" },
    });
    const result = await createDriveFolder(client, { name: "Reports" });
    expect(mockFiles.create).toHaveBeenCalledWith({
      requestBody: { name: "Reports", mimeType: "application/vnd.google-apps.folder" },
    });
    expect(result).toMatchObject({ id: "fld1", name: "Reports" });
  });

  it("places the folder in a parent when given", async () => {
    mockFiles.create.mockResolvedValue({ data: { id: "fld2" } });
    await createDriveFolder(client, { name: "Sub", parentFolderId: "fld1" });
    expect(mockFiles.create.mock.calls[0][0].requestBody.parents).toEqual(["fld1"]);
  });
});

describe("copyDriveFile", () => {
  it("copies a file with an optional new name", async () => {
    mockFiles.copy.mockResolvedValue({ data: { id: "f-copy", name: "notes copy.md" } });
    const result = await copyDriveFile(client, { fileId: "f1", name: "notes copy.md" });
    expect(mockFiles.copy).toHaveBeenCalledWith({
      fileId: "f1",
      requestBody: { name: "notes copy.md" },
    });
    expect(result.id).toBe("f-copy");
  });

  it("copies without renaming when no name is given", async () => {
    mockFiles.copy.mockResolvedValue({ data: { id: "f-copy2" } });
    await copyDriveFile(client, { fileId: "f1" });
    expect(mockFiles.copy).toHaveBeenCalledWith({ fileId: "f1", requestBody: {} });
  });
});

describe("listDrivePermissions", () => {
  it("lists permissions for a file", async () => {
    mockPermissions.list.mockResolvedValue({
      data: {
        permissions: [
          { id: "p1", type: "user", role: "writer", emailAddress: "__VG_EMAIL_b3e8b64ce83f__" },
          { id: "p2", type: "anyone", role: "reader" },
        ],
      },
    });
    const result = await listDrivePermissions(client, { fileId: "f1" });
    expect(mockPermissions.list).toHaveBeenCalledWith({ fileId: "f1" });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "p1", type: "user", role: "writer" });
    expect(result[1]).toMatchObject({ id: "p2", type: "anyone", role: "reader" });
  });
});

describe("deleteDrivePermission", () => {
  it("deletes a permission by id", async () => {
    mockPermissions.delete.mockResolvedValue({ data: {} });
    await deleteDrivePermission(client, { fileId: "f1", permissionId: "p1" });
    expect(mockPermissions.delete).toHaveBeenCalledWith({ fileId: "f1", permissionId: "p1" });
  });
});

describe("shareDriveFile extended", () => {
  it("shares with anyone via link (type=anyone)", async () => {
    mockPermissions.create.mockResolvedValue({ data: { id: "perm-link" } });
    const result = await shareDriveFile(client, {
      fileId: "f1",
      type: "anyone",
      role: "reader",
      sendNotificationEmail: false,
    });
    expect(mockPermissions.create).toHaveBeenCalledWith({
      fileId: "f1",
      requestBody: { type: "anyone", role: "reader" },
      sendNotificationEmail: false,
    });
    expect(result.id).toBe("perm-link");
  });

  it("shares with a domain (type=domain with domain field)", async () => {
    mockPermissions.create.mockResolvedValue({ data: { id: "perm-dom" } });
    await shareDriveFile(client, {
      fileId: "f1",
      type: "domain",
      domain: "example.com",
      role: "writer",
    });
    expect(mockPermissions.create).toHaveBeenCalledWith({
      fileId: "f1",
      requestBody: { type: "domain", role: "writer", domain: "example.com" },
      sendNotificationEmail: true,
    });
  });

  it("transfers ownership when transferOwnership is set", async () => {
    mockPermissions.create.mockResolvedValue({ data: { id: "perm-owner" } });
    await shareDriveFile(client, {
      fileId: "f1",
      email: "__VG_EMAIL_b3e8b64ce83f__",
      role: "owner",
      transferOwnership: true,
    });
    expect(mockPermissions.create).toHaveBeenCalledWith({
      fileId: "f1",
      requestBody: { type: "user", role: "owner", emailAddress: "__VG_EMAIL_b3e8b64ce83f__" },
      sendNotificationEmail: true,
      transferOwnership: true,
    });
  });
});

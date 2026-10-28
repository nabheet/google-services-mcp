import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// googleapis is mocked; the filesystem is real, so these tests prove the bytes
// actually land on disk under a directory that did not exist.
const mockFiles = vi.hoisted(() => ({ get: vi.fn(), export: vi.fn() }));

vi.mock("googleapis", () => ({
  google: {
    drive: vi.fn(() => ({ files: mockFiles })),
  },
}));

import { downloadDriveFile, exportDriveFile } from "../src/services/drive.js";

const client = {} as never;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "drive-save-"));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("saveToPath writes through the real filesystem", () => {
  it("creates missing parent directories for a download", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockFiles.get.mockResolvedValue({ data: new Blob([bytes]) });
    const saveToPath = join(tmpDir, "nested", "deeper", "out.png");

    const result = await downloadDriveFile(client, { fileId: "f1", saveToPath });

    expect(result).toEqual({ savedTo: saveToPath });
    expect(readFileSync(saveToPath)).toEqual(bytes);
  });

  it("creates missing parent directories for an export", async () => {
    mockFiles.export.mockResolvedValue({ data: new Blob([Buffer.from("%PDF-1.4")]) });
    const saveToPath = join(tmpDir, "exports", "2026", "doc.pdf");

    const result = await exportDriveFile(client, {
      fileId: "f1",
      mimeType: "application/pdf",
      saveToPath,
    });

    expect(result).toEqual({ savedTo: saveToPath });
    expect(readFileSync(saveToPath).toString()).toBe("%PDF-1.4");
  });
});

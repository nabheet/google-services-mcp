/**
 * Live smoke test for #39: Drive upload by local path + download saveToPath.
 *
 * Uploads a real binary file by path into a folder, downloads it back to a
 * local path, compares the bytes, then cleans up.
 *
 * Both locations are supplied by the caller, so no local path or Drive folder
 * id is committed:
 *
 *   SMOKE_FILE=/path/to/file.pdf \
 *   SMOKE_FOLDER_ID=<drive folder id> \
 *   npx tsx scripts/smoke-drive-path-upload.mjs
 */
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authManager } from "../src/auth/manager.js";
import { deleteDriveFile, downloadDriveFile, uploadDriveFile } from "../src/services/drive.js";

const FILE = process.env.SMOKE_FILE;
const FOLDER = process.env.SMOKE_FOLDER_ID;

if (!FILE || !FOLDER) {
  console.error("Set SMOKE_FILE (local file path) and SMOKE_FOLDER_ID (Drive folder id).");
  process.exit(1);
}

const NAME = "smoke-39-upload.bin";
const MIME = "application/octet-stream";
const OUT = join(tmpdir(), `smoke-39-${Date.now()}.bin`);

async function sha256(p) {
  return createHash("sha256")
    .update(await readFile(p))
    .digest("hex");
}

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);
  const expected = await sha256(FILE);

  const uploaded = await uploadDriveFile(client, {
    name: NAME,
    mimeType: MIME,
    path: FILE,
    parentFolderId: FOLDER,
  });
  console.log(`uploaded id=${uploaded.id} size=${uploaded.size}`);

  try {
    // Inside the try: a bogus upload must still be deleted by the finally block.
    if (!uploaded.id) throw new Error("no id returned");
    if (!uploaded.size || Number(uploaded.size) === 0) {
      throw new Error(`size suspicious: ${uploaded.size}`);
    }
    const saved = await downloadDriveFile(client, { fileId: uploaded.id, saveToPath: OUT });
    console.log(`downloaded -> ${JSON.stringify(saved)}`);
    const actual = await sha256(OUT);
    console.log(`sha256 match: ${expected === actual}`);
    if (expected !== actual) throw new Error("downloaded bytes differ from source");
    console.log("SMOKE PASSED");
  } finally {
    if (uploaded.id) {
      await deleteDriveFile(client, { fileId: uploaded.id });
      console.log(`deleted ${uploaded.id}`);
    }
    await unlink(OUT).catch(() => {});
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

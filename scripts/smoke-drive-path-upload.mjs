/**
 * Live smoke test for #39: Drive upload by local path + download saveToPath.
 *
 * Uploads a real binary PNG by path into a folder, downloads it back to a
 * local path, compares the bytes, then cleans up.
 *
 * Run: npx tsx scripts/smoke-drive-path-upload.mjs
 */
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { authManager } from "../src/auth/manager.js";
import { deleteDriveFile, downloadDriveFile, uploadDriveFile } from "../src/services/drive.js";

const FILE = "/Users/nabheet/Documents/SingleBarrelLabs/vss-registration-complete.pdf";
const FOLDER = "1hqGeAI6-CEZ_sGA4sisqMLcMxtqu07XC";
const NAME = "smoke-39-vss-registration.pdf";
const MIME = "application/pdf";
const OUT = `/tmp/smoke-39-${Date.now()}.pdf`;

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
  if (!uploaded.id) throw new Error("no id returned");
  if (Number(uploaded.size) < 100_000) throw new Error(`size suspicious: ${uploaded.size}`);

  try {
    const saved = await downloadDriveFile(client, { fileId: uploaded.id, saveToPath: OUT });
    console.log(`downloaded -> ${JSON.stringify(saved)}`);
    const actual = await sha256(OUT);
    console.log(`sha256 match: ${expected === actual}`);
    if (expected !== actual) throw new Error("downloaded bytes differ from source");
    console.log("SMOKE PASSED");
  } finally {
    await deleteDriveFile(client, { fileId: uploaded.id });
    console.log(`deleted ${uploaded.id}`);
    await unlink(OUT).catch(() => {});
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

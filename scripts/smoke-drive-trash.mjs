#!/usr/bin/env node
/**
 * Live smoke test for #40: google_drive_trash / google_drive_restore.
 *
 * Uploads a tiny text file, trashes it, verifies trashed:true, restores it,
 * verifies trashed:false, then permanently deletes it (cleanup).
 *
 * Run: npx tsx scripts/smoke-drive-trash.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  deleteDriveFile,
  restoreDriveFile,
  trashDriveFile,
  uploadDriveFile,
} from "../src/services/drive.js";

const now = Date.now();

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const uploaded = await uploadDriveFile(client, {
    name: `smoke-trash-${now}.txt`,
    content: "smoke",
    mimeType: "text/plain",
  });
  const fileId = uploaded.id;
  console.log(`UPLOAD OK id=${fileId}`);

  try {
    const trashed = await trashDriveFile(client, { fileId });
    console.log(`TRASH OK trashed=${trashed.trashed}`);
    if (trashed.trashed !== true) throw new Error("Expected trashed=true");

    const restored = await restoreDriveFile(client, { fileId });
    console.log(`RESTORE OK trashed=${restored.trashed}`);
    if (restored.trashed !== false) throw new Error("Expected trashed=false");
  } finally {
    await deleteDriveFile(client, { fileId });
    console.log(`CLEANUP OK id=${fileId}`);
  }
}

await main();

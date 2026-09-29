#!/usr/bin/env node
// Live smoke test for google_drive_move (PR #81).
// Creates temp folder + file, moves file, verifies parents, cleans up.
import { authManager } from "../dist/auth/manager.js";
import {
  createDriveFolder,
  deleteDriveFile,
  getDriveFile,
  moveDriveFile,
  uploadDriveFile,
} from "../dist/services/drive.js";

const ts = Date.now();
const results = [];
const step = (msg) => {
  console.log("• " + msg);
  results.push(msg);
};
const fail = (msg) => {
  console.error("✗ FAIL: " + msg);
  process.exitCode = 1;
};

const account = process.argv[2] || "personal";
console.log(`Using account: ${account}`);
const client = await authManager.getClient(account);

let folderA = null;
let folderB = null;
let fileId = null;

try {
  // 1. Create destination folder (folder B) first — folder A is just for file creation
  const a = await createDriveFolder(client, { name: `mcp-move-test-${ts}-A` });
  folderA = a.id;
  step(`created folder A: ${folderA} (${a.name})`);

  const b = await createDriveFolder(client, { name: `mcp-move-test-${ts}-B` });
  folderB = b.id;
  step(`created folder B: ${folderB} (${b.name})`);

  // 2. Upload a file into folder A
  const f = await uploadDriveFile(client, {
    name: `move-test-${ts}.txt`,
    mimeType: "text/plain",
    content: `smoke test ${ts}`,
    parentFolderId: folderA,
  });
  fileId = f.id;
  step(`uploaded file: ${fileId} into folder A`);

  // 3. Verify it's in folder A
  const before = await getDriveFile(client, { fileId });
  console.log(`   before move parents: ${JSON.stringify(before)}`);
  const beforeOk = before.id === fileId;
  if (!beforeOk) fail("file not readable before move");

  // 4. Move to folder B (remove from A)
  const moved = await moveDriveFile(client, {
    fileId,
    parentFolderId: folderB,
    removeParentFolderId: folderA,
  });
  step(`moved file -> folder B: ${JSON.stringify(moved)}`);

  // 5. Verify: list files inside folder B and confirm the file is there;
  //    and it is gone from folder A.
  const inB = await listFilesIn(client, folderB);
  const inA = await listFilesIn(client, folderA);
  const foundInB = inB.some((x) => x.id === fileId);
  const foundInA = inA.some((x) => x.id === fileId);
  console.log(`   files in B: ${JSON.stringify(inB)}`);
  console.log(`   files in A: ${JSON.stringify(inA)}`);
  if (foundInB && !foundInA) {
    step("VERIFIED: file present in B, absent from A (true move)");
  } else {
    fail(`move verification: inB=${foundInB} inA=${foundInA}`);
  }

  console.log("\n=== SMOKE TEST PASSED ===");
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  // 6. Cleanup
  try {
    if (fileId) await deleteDriveFile(client, { fileId });
    if (folderB) await deleteDriveFile(client, { fileId: folderB });
    if (folderA) await deleteDriveFile(client, { fileId: folderA });
    console.log("🧹 cleaned up file + folders");
  } catch (e) {
    console.error("⚠ cleanup error:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

async function listFilesIn(client, folderId) {
  const { listDriveFiles } = await import("../dist/services/drive.js");
  return listDriveFiles(client, { query: `'${folderId}' in parents` });
}
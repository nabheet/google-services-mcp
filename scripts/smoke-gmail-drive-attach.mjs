#!/usr/bin/env node
/**
 * Live smoke test for #41: attaching a Drive file by ID to a Gmail message.
 *
 * Uploads a tiny text file to Drive, sends an email to the connected account
 * with the Drive file attached by ID, verifies the sent message has an
 * attachment, then permanently deletes the Drive file (cleanup).
 *
 * Run: npx tsx scripts/smoke-gmail-drive-attach.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { deleteDriveFile, uploadDriveFile } from "../src/services/drive.js";
import { getGmailMessage, sendGmail } from "../src/services/gmail.js";

const now = Date.now();
const subject = `smoke drive attach ${now}`;

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const uploaded = await uploadDriveFile(client, {
    name: `smoke-attach-${now}.txt`,
    content: `drive-attachment-${now}`,
    mimeType: "text/plain",
  });
  const fileId = uploaded.id;
  console.log(`UPLOAD OK id=${fileId}`);

  try {
    const sent = await sendGmail(client, {
      to: acc.email,
      subject,
      body: "See attached Drive file",
      driveFileIds: [fileId],
    });
    console.log(`SEND OK id=${sent.id}`);
    if (!sent.id) throw new Error("Expected message id");

    const detail = await getGmailMessage(client, { id: sent.id });
    console.log(`VERIFY OK subject="${detail.subject}" attachments=${detail.hasAttachments}`);
    if (detail.subject !== subject) throw new Error(`Subject mismatch: ${detail.subject}`);
    if (!detail.hasAttachments) throw new Error("Expected attachment on sent message");
  } finally {
    await deleteDriveFile(client, { fileId });
    console.log(`CLEANUP OK id=${fileId}`);
  }
}

await main();

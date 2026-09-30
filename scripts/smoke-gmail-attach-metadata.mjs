#!/usr/bin/env node
/**
 * Live smoke test for #37: attachment metadata on getGmailMessage.
 *
 * Sends an email with a small text attachment, then fetches the sent message
 * and asserts the attachments array exposes the expected filename/mimeType.
 *
 * Run: npx tsx scripts/smoke-gmail-attach-metadata.mjs
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authManager } from "../src/auth/manager.js";
import { getGmailMessage, sendGmail } from "../src/services/gmail.js";

const now = Date.now();
const subject = `smoke attach metadata ${now}`;
const filename = "smoke-attach.txt";
const content = `smoke attachment body ${now}\n`;

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "smoke37-"));
  const file = join(dir, filename);
  await writeFile(file, content, "utf8");

  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);
  const sent = await sendGmail(client, {
    to: acc.email,
    subject,
    body: "Attachment metadata smoke",
    attachments: [{ path: file }],
  });
  console.log(`SEND OK id=${sent.id}`);
  if (!sent.id) throw new Error("Expected message id");

  const detail = await getGmailMessage(client, { id: sent.id });
  console.log(
    `VERIFY OK attachments=${JSON.stringify(
      detail.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType, size: a.size })),
    )}`,
  );
  const hit = detail.attachments.find((a) => a.filename === filename);
  if (!hit) throw new Error(`Expected attachment ${filename}`);
  if (hit.mimeType !== "text/plain") throw new Error(`Mime mismatch: ${hit.mimeType}`);
  if (!hit.size || hit.size < content.length) throw new Error(`Size mismatch: ${hit.size}`);

  await rm(dir, { recursive: true, force: true });
  console.log("CLEANUP OK");
}

await main();

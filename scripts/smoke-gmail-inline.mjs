#!/usr/bin/env node
/**
 * Live smoke test for #36: inline image attachments (Content-ID).
 *
 * Creates a draft with an inline image, reads the stored raw message, verifies
 * Content-Disposition: inline + Content-ID headers, then deletes the draft.
 * Uses a draft (not send) so nothing is delivered.
 *
 * Run: npx tsx scripts/smoke-gmail-inline.mjs
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { google } from "googleapis";
import { authManager } from "../src/auth/manager.js";
import { createGmailDraft, deleteGmailDraft } from "../src/services/gmail.js";

const now = Date.now();
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);
  const imgPath = join(tmpdir(), `smoke-inline-${now}.png`);
  writeFileSync(imgPath, PNG_1X1);

  const draft = await createGmailDraft(client, {
    to: acc.email,
    subject: `smoke inline ${now}`,
    body: '<img src="cid:logo.png@mcp" />',
    bodyType: "html",
    attachments: [
      { path: imgPath, filename: "logo.png", mimeType: "image/png", disposition: "inline" },
    ],
  });
  const draftId = draft.id;
  if (!draftId) throw new Error("Expected draft id");
  console.log(`DRAFT OK id=${draftId}`);

  const stored = await google
    .gmail({ version: "v1", auth: client })
    .users.drafts.get({ userId: "me", id: draftId, format: "raw" });
  const rawMsg = stored.data.message?.raw ?? "";
  const raw = Buffer.from(rawMsg, "base64url").toString("utf8");
  console.log("--- RAW (head) ---");
  console.log(raw.split("\r\n").slice(0, 40).join("\n"));
  if (!raw.includes('Content-Disposition: inline; filename="logo.png"')) {
    throw new Error("Missing inline disposition");
  }
  if (!raw.includes("Content-ID: <logo.png@mcp>")) {
    throw new Error("Missing auto Content-ID");
  }
  console.log("INLINE VERIFIED OK");

  await deleteGmailDraft(client, { id: draftId });
  console.log("CLEANUP OK");
}

await main();

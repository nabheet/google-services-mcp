#!/usr/bin/env node
/**
 * Live smoke test for #34: update an existing Gmail draft.
 *
 * Creates a draft, updates subject/body/recipient, verifies the stored raw
 * message reflects the update, then deletes the draft. Nothing is delivered.
 *
 * Run: npx tsx scripts/smoke-gmail-drafts-update.mjs
 */
import { google } from "googleapis";
import { authManager } from "../src/auth/manager.js";
import { createGmailDraft, deleteGmailDraft, updateGmailDraft } from "../src/services/gmail.js";

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const created = await createGmailDraft(client, {
    to: acc.email,
    subject: "draft before",
    body: "before body",
  });
  if (!created.id) throw new Error("Expected draft id");
  console.log(`CREATE OK id=${created.id}`);

  const updated = await updateGmailDraft(client, {
    id: created.id,
    to: acc.email,
    subject: "draft after",
    body: "after body",
  });
  if (updated.id !== created.id) throw new Error("Update changed draft id");
  console.log(`UPDATE OK id=${updated.id}`);

  const stored = await google
    .gmail({ version: "v1", auth: client })
    .users.drafts.get({ userId: "me", id: created.id, format: "raw" });
  const raw = Buffer.from(stored.data.message?.raw ?? "", "base64url").toString("utf8");
  if (!raw.includes("Subject: draft after")) throw new Error("Subject not updated");
  if (!raw.includes("after body")) throw new Error("Body not updated");
  console.log("RAW VERIFIED OK");

  await deleteGmailDraft(client, { id: created.id });
  console.log("CLEANUP OK");
}

await main();

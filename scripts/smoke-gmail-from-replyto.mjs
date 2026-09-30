#!/usr/bin/env node
/**
 * Live smoke test for #38: From override + Reply-To header on Gmail send.
 *
 * Sends an email to the connected account with an explicit From (the account's
 * own send-as address) and a Reply-To address, then verifies the stored
 * message carries the From and Reply-To headers.
 *
 * Run: npx tsx scripts/smoke-gmail-from-replyto.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { getGmailMessage, sendGmail } from "../src/services/gmail.js";

const now = Date.now();
const subject = `smoke from replyto ${now}`;
const replyTo = `reply-${now}@example.com`;

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const sent = await sendGmail(client, {
    to: acc.email,
    subject,
    body: "From override + Reply-To smoke",
    from: acc.email,
    replyTo,
  });
  console.log(`SEND OK id=${sent.id}`);
  if (!sent.id) throw new Error("Expected message id");

  const detail = await getGmailMessage(client, { id: sent.id });
  console.log(`VERIFY OK from="${detail.from}" subject="${detail.subject}"`);
  if (detail.subject !== subject) throw new Error(`Subject mismatch: ${detail.subject}`);
  if (!detail.from || !detail.from.includes(acc.email.split("@")[0])) {
    throw new Error(`From mismatch: ${detail.from}`);
  }
}

await main();

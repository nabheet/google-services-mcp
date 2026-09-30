#!/usr/bin/env node
/**
 * Live smoke test for #35: Gmail thread tools.
 *
 * Read-only: lists threads, fetches the newest thread in full, verifies each
 * message parsed with subject/body. No mutation.
 *
 * Run: npx tsx scripts/smoke-gmail-threads.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { getGmailThread, listGmailThreads } from "../src/services/gmail.js";

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const threads = await listGmailThreads(client, { maxResults: 5 });
  console.log(`LIST OK count=${threads.length}`);
  if (threads.length === 0) {
    console.log("No threads — get path skipped");
    return;
  }
  const first = threads[0];
  console.log(`first=${first.id} snippet="${first.snippet ?? ""}"`);

  const detail = await getGmailThread(client, { id: first.id });
  console.log(
    `GET OK id=${detail.id} historyId=${detail.historyId} messages=${detail.messages.length}`,
  );
  const msg = detail.messages[0];
  console.log(`msg0 subject="${msg.subject}" body="${msg.body.slice(0, 60)}"`);
  for (const m of detail.messages) {
    if (!m.subject && !m.body) throw new Error(`Unparsed message ${m.id}`);
  }
  console.log("THREAD VERIFIED OK");
}

await main();

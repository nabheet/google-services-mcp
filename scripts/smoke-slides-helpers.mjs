#!/usr/bin/env node
/**
 * Live smoke test for #49: Slides helpers.
 *
 * Creates a presentation, adds slides, duplicates one, moves it, adds a textbox
 * with text and an image from a URL, then deletes the presentation file.
 *
 * Run: npx tsx scripts/smoke-slides-helpers.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { deleteDriveFile } from "../src/services/drive.js";
import {
  createImage,
  createPresentation,
  createSlide,
  createTextbox,
  deleteSlide,
  duplicateSlide,
  getPresentation,
  moveSlide,
} from "../src/services/slides.js";

const now = Date.now();

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const deck = await createPresentation(client, { title: `smoke slides ${now}` });
  const presentationId = deck.presentationId;
  if (!presentationId) throw new Error("Expected presentationId");
  console.log(`CREATE OK presentationId=${presentationId}`);

  const s1 = await createSlide(client, { presentationId });
  const s2 = await createSlide(client, { presentationId });
  const s1Id = s1.objectId;
  const s2Id = s2.objectId;
  if (!s1Id || !s2Id) throw new Error("Expected slide ids");
  console.log(`SLIDES OK s1=${s1Id} s2=${s2Id}`);

  const dup = await duplicateSlide(client, { presentationId, slideObjectId: s1Id });
  console.log(`DUPLICATE OK dupId=${dup.objectId}`);

  await moveSlide(client, { presentationId, slideObjectId: s2Id, insertionIndex: 0 });
  const after = await getPresentation(client, { presentationId });
  const order = (after.slides ?? []).map((s) => s.objectId);
  if (order[0] !== s2Id) throw new Error(`Move failed, order=${JSON.stringify(order)}`);
  console.log(`MOVE OK order=${JSON.stringify(order)}`);

  const tb = await createTextbox(client, {
    presentationId,
    pageObjectId: s1Id,
    text: "Hello from smoke",
    width: 300,
    height: 60,
  });
  if (!tb.objectId) throw new Error("Expected textbox id");
  console.log(`TEXTBOX OK tbId=${tb.objectId}`);

  const img = await createImage(client, {
    presentationId,
    pageObjectId: s1Id,
    url: "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png",
    width: 200,
    height: 80,
  });
  if (!img.objectId) throw new Error("Expected image id");
  console.log(`IMAGE OK imgId=${img.objectId}`);

  // Clean up: delete both slides then the presentation file.
  await deleteSlide(client, { presentationId, slideObjectId: s1Id });
  await deleteSlide(client, { presentationId, slideObjectId: s2Id });
  await deleteDriveFile(client, { fileId: presentationId });
  console.log("CLEANUP OK");
}

await main();

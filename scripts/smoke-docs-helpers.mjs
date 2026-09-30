#!/usr/bin/env node
/**
 * Live smoke test for #47: Docs deleteRange, insertTable, insertInlineImage.
 *
 * Creates a document, inserts text, deletes a range, inserts a table and an
 * inline image, verifies content, then deletes the document.
 *
 * Run: npx tsx scripts/smoke-docs-helpers.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  createDocument,
  deleteRange,
  getDocumentText,
  insertInlineImage,
  insertTable,
  insertText,
} from "../src/services/docs.js";
import { deleteDriveFile } from "../src/services/drive.js";

const now = Date.now();
const IMG_URI =
  "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png";

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const doc = await createDocument(client, { title: `smoke docs ${now}` });
  const documentId = doc.documentId;
  if (!documentId) throw new Error("Expected documentId");
  console.log(`CREATE OK documentId=${documentId}`);

  await insertText(client, { documentId, text: "Alpha\nBeta\nGamma\n" });
  await deleteRange(client, { documentId, startIndex: 7, endIndex: 12 }); // remove "Beta\n"
  const text = await getDocumentText(client, { documentId });
  if (text.includes("Beta")) throw new Error(`deleteRange failed: ${JSON.stringify(text)}`);
  if (!text.includes("Alpha") || !text.includes("Gamma")) {
    throw new Error(`Unexpected content after delete: ${JSON.stringify(text)}`);
  }
  console.log("DELETE RANGE OK");

  await insertTable(client, { documentId, rows: 2, columns: 3, index: 1 });
  const afterTable = await getDocumentText(client, { documentId });
  console.log("INSERT TABLE OK");

  const img = await insertInlineImage(client, { documentId, uri: IMG_URI, index: 19 });
  if (!img.objectId)
    throw new Error(`insertInlineImage returned no objectId: ${JSON.stringify(img)}`);
  console.log(`INSERT INLINE IMAGE OK objectId=${img.objectId}`);

  await deleteDriveFile(client, { fileId: documentId });
  console.log("CLEANUP OK");
  console.log(`TEXT WAS: ${JSON.stringify(afterTable)}`);
}

await main();

#!/usr/bin/env node
/**
 * Live smoke test for #50: Forms edit operations.
 *
 * Creates a form, adds two questions, updates one, moves it, renames the form,
 * creates a spreadsheet and exports responses, then deletes both files.
 *
 * Run: npx tsx scripts/smoke-forms-edit.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { deleteDriveFile } from "../src/services/drive.js";
import {
  addQuestion,
  createForm,
  deleteForm,
  exportFormResponsesToSheet,
  getForm,
  moveFormQuestion,
  renameForm,
  updateFormQuestion,
} from "../src/services/forms.js";
import { createSpreadsheet } from "../src/services/sheets.js";

const now = Date.now();

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const form = await createForm(client, { title: `smoke forms ${now}` });
  const formId = form.formId;
  if (!formId) throw new Error("Expected formId");
  console.log(`CREATE OK formId=${formId}`);

  await addQuestion(client, { formId, title: "Q1", type: "multiple_choice", options: ["A", "B"] });
  await addQuestion(client, { formId, title: "Q2", required: true });
  let detail = await getForm(client, { formId });
  const q1 = detail.items?.[0]?.questionItem?.question?.questionId;
  if (!q1) throw new Error("Expected q1");
  console.log(`ADD OK q1=${q1}`);

  await updateFormQuestion(client, { formId, questionId: q1, title: "Q1 updated", required: true });
  detail = await getForm(client, { formId });
  if (detail.items?.[0]?.title !== "Q1 updated") throw new Error("Update failed");
  console.log("UPDATE OK");

  await moveFormQuestion(client, { formId, questionId: q1, newIndex: 1 });
  detail = await getForm(client, { formId });
  if (detail.items?.[1]?.title !== "Q1 updated") throw new Error("Move failed");
  console.log("MOVE OK");

  await renameForm(client, { formId, title: `smoke forms renamed ${now}` });
  detail = await getForm(client, { formId });
  if (!detail.info?.title?.includes("renamed")) throw new Error("Rename failed");
  console.log("RENAME OK");

  const sheet = await createSpreadsheet(client, { title: `smoke forms export ${now}` });
  const spreadsheetId = sheet.spreadsheetId;
  if (!spreadsheetId) throw new Error("Expected spreadsheetId");
  const exported = await exportFormResponsesToSheet(client, { formId, spreadsheetId });
  console.log(`EXPORT OK responses=${exported.responses} rows=${exported.appendedRows}`);

  await deleteForm(client, { formId });
  await deleteDriveFile(client, { fileId: spreadsheetId });
  console.log("CLEANUP OK");
}

await main();

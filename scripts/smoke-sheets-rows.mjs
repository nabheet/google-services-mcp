#!/usr/bin/env node
/**
 * Live smoke test for #48: Sheets row + named-range helpers.
 *
 * Creates a spreadsheet, writes rows, inserts and deletes rows, sets a named
 * range, reads it back, then deletes the spreadsheet file.
 *
 * Run: npx tsx scripts/smoke-sheets-rows.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { deleteDriveFile } from "../src/services/drive.js";
import {
  createSpreadsheet,
  deleteRows,
  getNamedRanges,
  insertRows,
  readSheetRange,
  setNamedRange,
  writeSheetRange,
} from "../src/services/sheets.js";

const now = Date.now();

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const sheet = await createSpreadsheet(client, { title: `smoke rows ${now}` });
  const spreadsheetId = sheet.spreadsheetId;
  if (!spreadsheetId) throw new Error("Expected spreadsheetId");
  const sheetId = sheet.sheets?.[0]?.properties?.sheetId ?? 0;
  console.log(`CREATE OK spreadsheetId=${spreadsheetId} sheetId=${sheetId}`);

  await writeSheetRange(client, {
    spreadsheetId,
    range: "Sheet1!A1:C4",
    values: [
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "i"],
      ["j", "k", "l"],
    ],
  });
  console.log("WRITE OK");

  await insertRows(client, { spreadsheetId, sheetId, startIndex: 2, numRows: 2 });
  await writeSheetRange(client, {
    spreadsheetId,
    range: "Sheet1!A3:B4",
    values: [
      ["x", "x"],
      ["y", "y"],
    ],
  });
  const afterInsert = await readSheetRange(client, {
    spreadsheetId,
    range: "Sheet1!A1:C6",
  });
  if (afterInsert[2]?.[0] !== "x") throw new Error(`Insert failed: ${JSON.stringify(afterInsert)}`);
  console.log("INSERT OK");

  await deleteRows(client, { spreadsheetId, sheetId, startIndex: 3, numRows: 1 });
  const afterDelete = await readSheetRange(client, {
    spreadsheetId,
    range: "Sheet1!A1:C6",
  });
  const hasY = afterDelete.some((row) => row[0] === "y");
  if (hasY) throw new Error(`Delete failed: ${JSON.stringify(afterDelete)}`);
  console.log("DELETE OK");

  await setNamedRange(client, {
    spreadsheetId,
    name: "SmokeData",
    range: { sheetId, startRowIndex: 0, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 2 },
  });
  const nrs = await getNamedRanges(client, { spreadsheetId });
  const found = nrs.find((nr) => nr.name === "SmokeData");
  if (!found) throw new Error(`Named range missing: ${JSON.stringify(nrs)}`);
  console.log(`NAMED RANGE OK ${JSON.stringify(found)}`);

  await deleteDriveFile(client, { fileId: spreadsheetId });
  console.log("CLEANUP OK");
}

await main();

import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendSheetRange,
  getSpreadsheet,
  readSheetRange,
  writeSheetRange,
} from "../../src/services/sheets.js";
import { cleanup, lockNetwork, makeClient } from "./helpers.js";

/**
 * Hermetic E2E for Sheets: real googleapis request pipeline intercepted by
 * nock. Validates spreadsheet metadata, value reads, and value writes.
 */

describe("sheets E2E (nock)", () => {
  afterEach(cleanup);

  it("getSpreadsheet reads spreadsheet metadata + first sheet values", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://sheets.googleapis.com")
      .get("/v4/spreadsheets/sp1")
      .query(true)
      .reply(200, {
        spreadsheetId: "sp1",
        properties: { title: "E2E Sheet" },
        sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
      });
    nock("https://sheets.googleapis.com")
      .get("/v4/spreadsheets/sp1/values/Sheet1%21A1%3AZ100")
      .query(true)
      .reply(200, {
        range: "Sheet1!A1:Z100",
        majorDimension: "ROWS",
        values: [
          ["a", "b"],
          ["c", "d"],
        ],
      });

    const res = await getSpreadsheet(client, { spreadsheetId: "sp1", range: "Sheet1!A1:Z100" });

    expect(res.properties?.title).toBe("E2E Sheet");
    expect(res.sheets?.[0]?.properties?.title).toBe("Sheet1");
    expect(res.values).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it("readSheetRange returns values for the requested range", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://sheets.googleapis.com")
      .get("/v4/spreadsheets/sp1/values/Sheet1%21A1%3AC3")
      .query((q) => q.majorDimension === "ROWS")
      .reply(200, {
        range: "Sheet1!A1:C3",
        majorDimension: "ROWS",
        values: [
          ["1", "2", "3"],
          ["4", "5", "6"],
        ],
      });

    const res = await readSheetRange(client, { spreadsheetId: "sp1", range: "Sheet1!A1:C3" });

    expect(res).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it("writeSheetRange PUTs values to the range", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://sheets.googleapis.com")
      .put("/v4/spreadsheets/sp1/values/Sheet1%21A1%3AB2", (body) => {
        const b = body as { values?: string[][]; majorDimension?: string };
        return (
          JSON.stringify(b.values) ===
          JSON.stringify([
            ["x", "y"],
            ["z", "w"],
          ])
        );
      })
      .query((q) => q.valueInputOption === "USER_ENTERED")
      .reply(200, {
        spreadsheetId: "sp1",
        updatedRange: "Sheet1!A1:B2",
        updatedRows: 2,
        updatedColumns: 2,
        updatedCells: 4,
      });

    const res = await writeSheetRange(client, {
      spreadsheetId: "sp1",
      range: "Sheet1!A1:B2",
      values: [
        ["x", "y"],
        ["z", "w"],
      ],
    });

    expect(res.updatedCells).toBe(4);
    expect(nock.isDone()).toBe(true);
  });

  it("appendSheetRange POSTs values to the range", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://sheets.googleapis.com")
      .post("/v4/spreadsheets/sp1/values/Sheet1%21A1%3AB2:append", (body) => {
        const b = body as { values?: string[][] };
        return b.values?.length === 1;
      })
      .query((q) => q.valueInputOption === "USER_ENTERED")
      .reply(200, {
        spreadsheetId: "sp1",
        tableRange: "Sheet1!A1:B2",
        updates: { updatedRows: 1, updatedCells: 2 },
      });

    const res = await appendSheetRange(client, {
      spreadsheetId: "sp1",
      range: "Sheet1!A1:B2",
      values: [["new", "row"]],
    });

    expect(res.updates?.updatedRows).toBe(1);
    expect(nock.isDone()).toBe(true);
  });
});

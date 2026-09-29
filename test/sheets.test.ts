import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSpreadsheets = {
  get: vi.fn(),
  create: vi.fn(),
  batchUpdate: vi.fn(),
  values: {
    get: vi.fn(),
    update: vi.fn(),
    append: vi.fn(),
  },
};

vi.mock("googleapis", () => ({
  google: {
    sheets: vi.fn(() => ({ spreadsheets: mockSpreadsheets })),
  },
}));

const client = {} as never;

import {
  addSheet,
  appendSheetRange,
  batchUpdateSheet,
  createSpreadsheet,
  deleteSheet,
  getSpreadsheet,
  readSheetRange,
  renameSheet,
  writeSheetRange,
} from "../src/services/sheets.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sheets service", () => {
  it("getSpreadsheet returns metadata plus values when a range is given", async () => {
    mockSpreadsheets.get.mockResolvedValue({
      data: { spreadsheetId: "s1", properties: { title: "T" } },
    });
    mockSpreadsheets.values.get.mockResolvedValue({ data: { values: [["a", "b"]] } });
    const result = await getSpreadsheet(client, { spreadsheetId: "s1", range: "Sheet1!A1:B2" });
    expect(result.spreadsheetId).toBe("s1");
    expect(result.values).toEqual([["a", "b"]]);
    expect(mockSpreadsheets.get).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      includeGridData: false,
    });
    expect(mockSpreadsheets.values.get).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      range: "Sheet1!A1:B2",
    });
  });

  it("getSpreadsheet skips values fetch without a range", async () => {
    mockSpreadsheets.get.mockResolvedValue({ data: { spreadsheetId: "s1" } });
    const result = await getSpreadsheet(client, { spreadsheetId: "s1" });
    expect(result.values).toBeUndefined();
    expect(mockSpreadsheets.values.get).not.toHaveBeenCalled();
  });

  it("readSheetRange reads values with major dimension", async () => {
    mockSpreadsheets.values.get.mockResolvedValue({ data: { values: [["1", "2"]] } });
    const result = await readSheetRange(client, { spreadsheetId: "s1", range: "A1:C3" });
    expect(result).toEqual([["1", "2"]]);
    expect(mockSpreadsheets.values.get).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      range: "A1:C3",
      majorDimension: "ROWS",
    });
  });

  it("readSheetRange returns empty array when no values", async () => {
    mockSpreadsheets.values.get.mockResolvedValue({ data: {} });
    const result = await readSheetRange(client, { spreadsheetId: "s1", range: "A1:C3" });
    expect(result).toEqual([]);
  });

  it("writeSheetRange updates values", async () => {
    mockSpreadsheets.values.update.mockResolvedValue({
      data: { updatedRows: 1, updatedColumns: 2 },
    });
    const result = await writeSheetRange(client, {
      spreadsheetId: "s1",
      range: "A1:B1",
      values: [["x", "y"]],
    });
    expect(result).toMatchObject({ updatedRows: 1, updatedColumns: 2 });
    expect(mockSpreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      range: "A1:B1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["x", "y"]] },
    });
  });

  it("writeSheetRange honors valueInputOption", async () => {
    mockSpreadsheets.values.update.mockResolvedValue({ data: {} });
    await writeSheetRange(client, {
      spreadsheetId: "s1",
      range: "A1",
      values: [["=1+1"]],
      valueInputOption: "RAW",
    });
    expect(mockSpreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({ valueInputOption: "RAW" }),
    );
  });

  it("appendSheetRange appends rows", async () => {
    mockSpreadsheets.values.append.mockResolvedValue({ data: { tableRange: "Sheet1!A1:B1" } });
    const result = await appendSheetRange(client, {
      spreadsheetId: "s1",
      range: "Sheet1!A1",
      values: [["c", "d"]],
    });
    expect(result.tableRange).toBe("Sheet1!A1:B1");
    expect(mockSpreadsheets.values.append).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["c", "d"]] },
    });
  });

  it("createSpreadsheet creates with title", async () => {
    mockSpreadsheets.create.mockResolvedValue({
      data: { spreadsheetId: "s2", properties: { title: "New" } },
    });
    const result = await createSpreadsheet(client, { title: "New" });
    expect(result.spreadsheetId).toBe("s2");
    expect(mockSpreadsheets.create).toHaveBeenCalledWith({
      requestBody: { properties: { title: "New" } },
    });
  });

  it("batchUpdateSheet sends raw requests", async () => {
    mockSpreadsheets.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    const requests = [{ addSheet: { properties: { title: "Extra" } } }];
    const result = await batchUpdateSheet(client, { spreadsheetId: "s1", requests });
    expect(result.replies).toEqual([]);
    expect(mockSpreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      requestBody: { requests },
    });
  });

  it("propagates API errors", async () => {
    mockSpreadsheets.values.get.mockRejectedValue(new Error("bad range"));
    await expect(readSheetRange(client, { spreadsheetId: "s1", range: "Z99" })).rejects.toThrow(
      "bad range",
    );
  });

  it("addSheet sends addSheet request with title and index", async () => {
    mockSpreadsheets.batchUpdate.mockResolvedValue({
      data: { replies: [{ addSheet: { properties: { sheetId: 123, title: "Extra" } } }] },
    });
    const result = await addSheet(client, {
      spreadsheetId: "s1",
      title: "Extra",
      index: 1,
    });
    expect(result.replies).toEqual([
      { addSheet: { properties: { sheetId: 123, title: "Extra" } } },
    ]);
    expect(mockSpreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      requestBody: {
        requests: [{ addSheet: { properties: { title: "Extra", index: 1 } } }],
      },
    });
  });

  it("addSheet without index omits index property", async () => {
    mockSpreadsheets.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    await addSheet(client, { spreadsheetId: "s1", title: "Extra" });
    expect(mockSpreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      requestBody: { requests: [{ addSheet: { properties: { title: "Extra" } } }] },
    });
  });

  it("deleteSheet sends deleteSheet request", async () => {
    mockSpreadsheets.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    const result = await deleteSheet(client, { spreadsheetId: "s1", sheetId: 123 });
    expect(result.replies).toEqual([{}]);
    expect(mockSpreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      requestBody: { requests: [{ deleteSheet: { sheetId: 123 } }] },
    });
  });

  it("renameSheet sends updateSheetProperties request", async () => {
    mockSpreadsheets.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    const result = await renameSheet(client, {
      spreadsheetId: "s1",
      sheetId: 123,
      title: "Renamed",
    });
    expect(result.replies).toEqual([{}]);
    expect(mockSpreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: 123, title: "Renamed" },
              fields: "title",
            },
          },
        ],
      },
    });
  });
});

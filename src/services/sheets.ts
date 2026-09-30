import type { Auth, sheets_v4 } from "googleapis";
import { google } from "googleapis";

export interface GetSpreadsheetArgs {
  spreadsheetId: string;
  /** Optional A1 range to also read values from (e.g. "Sheet1!A1:B5"). */
  range?: string;
}

export interface ReadRangeArgs {
  spreadsheetId: string;
  /** A1 notation, e.g. "Sheet1!A1:C10" or "Sheet1!A:C". */
  range: string;
  majorDimension?: "ROWS" | "COLUMNS";
}

export interface WriteRangeArgs {
  spreadsheetId: string;
  /** A1 notation of the top-left cell, e.g. "Sheet1!A1". */
  range: string;
  /** Rows of values. */
  values: string[][];
  valueInputOption?: "RAW" | "USER_ENTERED";
}

export interface AppendRangeArgs {
  spreadsheetId: string;
  /** A1 range; rows are appended below the existing data. */
  range: string;
  values: string[][];
  valueInputOption?: "RAW" | "USER_ENTERED";
}

export interface CreateSpreadsheetArgs {
  title: string;
  /** Optional sheet titles to pre-create. */
  sheets?: string[];
}

export interface BatchUpdateArgs {
  spreadsheetId: string;
  /** Sheets batch update requests. */
  requests: sheets_v4.Schema$Request[];
}

export interface AddSheetArgs {
  spreadsheetId: string;
  /** Title of the new tab. */
  title: string;
  /** 0-based position to insert at (appended at end if omitted). */
  index?: number;
}

export interface SheetRefArgs {
  spreadsheetId: string;
  /** Numeric sheet ID (from google_sheets_get / getSpreadsheet metadata). */
  sheetId: number;
}

export interface RenameSheetArgs extends SheetRefArgs {
  title: string;
}

export async function getSpreadsheet(
  client: Auth.OAuth2Client,
  { spreadsheetId, range }: GetSpreadsheetArgs,
): Promise<sheets_v4.Schema$Spreadsheet> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
  const result = meta.data as sheets_v4.Schema$Spreadsheet & { values?: string[][] };
  if (range) {
    const values = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    if (values.data?.values) {
      result.values = values.data.values;
    }
  }
  return result;
}

export async function readSheetRange(
  client: Auth.OAuth2Client,
  { spreadsheetId, range, majorDimension = "ROWS" as const }: ReadRangeArgs,
): Promise<string[][]> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range, majorDimension });
  return res.data.values ?? [];
}

export async function writeSheetRange(
  client: Auth.OAuth2Client,
  { spreadsheetId, range, values, valueInputOption = "USER_ENTERED" as const }: WriteRangeArgs,
): Promise<sheets_v4.Schema$UpdateValuesResponse> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption,
    requestBody: { values },
  });
  return res.data;
}

export async function appendSheetRange(
  client: Auth.OAuth2Client,
  { spreadsheetId, range, values, valueInputOption = "USER_ENTERED" as const }: AppendRangeArgs,
): Promise<sheets_v4.Schema$AppendValuesResponse> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption,
    requestBody: { values },
  });
  return res.data;
}

export async function createSpreadsheet(
  client: Auth.OAuth2Client,
  { title, sheets }: CreateSpreadsheetArgs,
): Promise<sheets_v4.Schema$Spreadsheet> {
  const api = google.sheets({ version: "v4", auth: client });
  const requestBody: sheets_v4.Schema$Spreadsheet = { properties: { title } };
  if (sheets?.length) {
    requestBody.sheets = sheets.map((t) => ({ properties: { title: t } }));
  }
  const res = await api.spreadsheets.create({ requestBody });
  return res.data;
}

export async function batchUpdateSheet(
  client: Auth.OAuth2Client,
  { spreadsheetId, requests }: BatchUpdateArgs,
): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  return res.data;
}

/** Add a new tab to a spreadsheet. */
export async function addSheet(
  client: Auth.OAuth2Client,
  { spreadsheetId, title, index }: AddSheetArgs,
): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
  const properties: sheets_v4.Schema$SheetProperties = { title };
  if (index !== undefined) properties.index = index;
  return batchUpdateSheet(client, {
    spreadsheetId,
    requests: [{ addSheet: { properties } }],
  });
}

/** Permanently delete a tab from a spreadsheet. */
export async function deleteSheet(
  client: Auth.OAuth2Client,
  { spreadsheetId, sheetId }: SheetRefArgs,
): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
  return batchUpdateSheet(client, {
    spreadsheetId,
    requests: [{ deleteSheet: { sheetId } }],
  });
}

/** Rename a tab. */
export async function renameSheet(
  client: Auth.OAuth2Client,
  { spreadsheetId, sheetId, title }: RenameSheetArgs,
): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
  return batchUpdateSheet(client, {
    spreadsheetId,
    requests: [
      {
        updateSheetProperties: {
          properties: { sheetId, title },
          fields: "title",
        },
      },
    ],
  });
}

export interface RowRangeArgs {
  spreadsheetId: string;
  sheetId: number;
  startIndex: number;
  numRows?: number;
}

/** Insert blank rows starting at startIndex (0-based). */
export async function insertRows(
  client: Auth.OAuth2Client,
  { spreadsheetId, sheetId, startIndex, numRows = 1 }: RowRangeArgs,
): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
  return batchUpdateSheet(client, {
    spreadsheetId,
    requests: [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex,
            endIndex: startIndex + numRows,
          },
        },
      },
    ],
  });
}

/** Delete rows starting at startIndex (0-based). */
export async function deleteRows(
  client: Auth.OAuth2Client,
  { spreadsheetId, sheetId, startIndex, numRows = 1 }: RowRangeArgs,
): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
  return batchUpdateSheet(client, {
    spreadsheetId,
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex,
            endIndex: startIndex + numRows,
          },
        },
      },
    ],
  });
}

export interface GridRange {
  sheetId: number;
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

export interface NamedRangeInfo {
  namedRangeId?: string;
  name?: string;
  range?: GridRange;
}

/** List named ranges on a spreadsheet. */
export async function getNamedRanges(
  client: Auth.OAuth2Client,
  { spreadsheetId }: GetSpreadsheetArgs,
): Promise<NamedRangeInfo[]> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
  return (meta.data.namedRanges ?? []).map((nr) => ({
    namedRangeId: nr.namedRangeId ?? undefined,
    name: nr.name ?? undefined,
    range: {
      sheetId: nr.range?.sheetId ?? 0,
      ...(nr.range?.startRowIndex != null && { startRowIndex: nr.range.startRowIndex }),
      ...(nr.range?.endRowIndex != null && { endRowIndex: nr.range.endRowIndex }),
      ...(nr.range?.startColumnIndex != null && { startColumnIndex: nr.range.startColumnIndex }),
      ...(nr.range?.endColumnIndex != null && { endColumnIndex: nr.range.endColumnIndex }),
    },
  }));
}

export interface SetNamedRangeArgs {
  spreadsheetId: string;
  name: string;
  range: GridRange;
}

/** Create a named range on a spreadsheet. */
export async function setNamedRange(
  client: Auth.OAuth2Client,
  { spreadsheetId, name, range }: SetNamedRangeArgs,
): Promise<{ namedRangeId?: string | null }> {
  const res = await batchUpdateSheet(client, {
    spreadsheetId,
    requests: [{ addNamedRange: { namedRange: { name, range } } }],
  });
  return res.replies?.[0]?.addNamedRange?.namedRange ?? { namedRangeId: undefined };
}

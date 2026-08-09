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

export async function getSpreadsheet(
  client: Auth.OAuth2Client,
  { spreadsheetId, range }: GetSpreadsheetArgs
): Promise<any> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
  const result = meta.data as any;
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
  { spreadsheetId, range, majorDimension = "ROWS" as const }: ReadRangeArgs
): Promise<string[][]> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range, majorDimension });
  return res.data.values ?? [];
}

export async function writeSheetRange(
  client: Auth.OAuth2Client,
  { spreadsheetId, range, values, valueInputOption = "USER_ENTERED" as const }: WriteRangeArgs
): Promise<any> {
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
  { spreadsheetId, range, values, valueInputOption = "USER_ENTERED" as const }: AppendRangeArgs
): Promise<any> {
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
  { title, sheets }: CreateSpreadsheetArgs
): Promise<any> {
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
  { spreadsheetId, requests }: BatchUpdateArgs
): Promise<any> {
  const sheets = google.sheets({ version: "v4", auth: client });
  const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  return res.data;
}

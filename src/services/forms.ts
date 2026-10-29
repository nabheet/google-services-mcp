import type { Auth, forms_v1, sheets_v4 } from "googleapis";
import { google } from "googleapis";
import type { ListPage } from "../util/pagination.js";

export interface GetFormArgs {
  formId: string;
}

export interface AddQuestionArgs {
  formId: string;
  title: string;
  description?: string;
  /** Question type: text (default) or multiple_choice. */
  type?: "text" | "multiple_choice";
  /** Required for multiple_choice. */
  options?: string[];
  required?: boolean;
}

export interface UpdateQuestionArgs {
  formId: string;
  /** questionId of the question to update (not itemId). */
  questionId: string;
  title?: string;
  description?: string;
  options?: string[];
  required?: boolean;
}

export async function getForm(
  client: Auth.OAuth2Client,
  { formId }: GetFormArgs,
): Promise<forms_v1.Schema$Form> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.get({ formId });
  return res.data;
}

export async function getFormResponses(
  client: Auth.OAuth2Client,
  { formId, pageSize = 100, pageToken }: GetFormArgs & { pageSize?: number; pageToken?: string },
): Promise<ListPage<forms_v1.Schema$FormResponse>> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.responses.list({
    formId,
    pageSize,
    ...(pageToken !== undefined ? { pageToken } : {}),
  });
  return {
    items: res.data.responses ?? [],
    ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
  };
}

/**
 * Every response, following pagination. The API caps a page at 100 responses,
 * so a single call silently drops the rest; callers that need the whole set
 * (the sheet export) use this instead.
 */
export async function getAllFormResponses(
  client: Auth.OAuth2Client,
  { formId }: GetFormArgs,
): Promise<forms_v1.Schema$FormResponse[]> {
  const all: forms_v1.Schema$FormResponse[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const page = await getFormResponses(client, { formId, pageToken });
    all.push(...page.items);
    const next = page.nextPageToken;
    // A repeated token would loop forever; the API should never do this.
    if (next === undefined || next === pageToken) return all;
    pageToken = next;
  }
}

export async function createForm(
  client: Auth.OAuth2Client,
  { title }: { title: string },
): Promise<forms_v1.Schema$Form> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.create({ requestBody: { info: { title } } });
  return res.data;
}

export async function addQuestion(
  client: Auth.OAuth2Client,
  {
    formId,
    title,
    description,
    type = "text" as const,
    options,
    required = false,
  }: AddQuestionArgs,
): Promise<{ added: boolean }> {
  const forms = google.forms({ version: "v1", auth: client });
  let question: Record<string, unknown>;
  if (type === "multiple_choice") {
    question = {
      required,
      choiceQuestion: {
        type: "RADIO",
        options: (options ?? []).map((value) => ({ value })),
        shuffle: false,
      },
    };
  } else {
    question = { required, textQuestion: {} };
  }
  const form = await forms.forms.get({ formId, fields: "items.itemId" });
  const index = form.data.items?.length ?? 0;
  await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests: [
        {
          createItem: {
            location: { index },
            item: { title, description, questionItem: { question } },
          },
        },
      ],
    },
  });
  return { added: true };
}

export type BatchUpdateArgs = {
  formId: string;
  requests: forms_v1.Schema$Request[];
};

export async function batchUpdateForm(
  client: Auth.OAuth2Client,
  { formId, requests }: BatchUpdateArgs,
): Promise<forms_v1.Schema$BatchUpdateFormResponse> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.batchUpdate({ formId, requestBody: { requests } });
  return res.data;
}

/** Find the item index for a questionId, or throw. */
async function locateQuestionIndex(
  client: Auth.OAuth2Client,
  formId: string,
  questionId: string,
): Promise<number> {
  const form = await getForm(client, { formId });
  const items = form.items ?? [];
  const idx = items.findIndex((i) => i.questionItem?.question?.questionId === questionId);
  if (idx === -1) throw new Error(`Question ${questionId} not found in form ${formId}`);
  return idx;
}

export async function updateFormQuestion(
  client: Auth.OAuth2Client,
  { formId, questionId, title, description, options, required }: UpdateQuestionArgs,
): Promise<{ updated: boolean }> {
  const forms = google.forms({ version: "v1", auth: client });
  const form = await getForm(client, { formId });
  const items = form.items ?? [];
  const idx = items.findIndex((i) => i.questionItem?.question?.questionId === questionId);
  if (idx === -1) throw new Error(`Question ${questionId} not found in form ${formId}`);

  const item = items[idx];
  const question = item.questionItem?.question;
  if (!question) throw new Error(`Item at index ${idx} has no question`);

  // Build a full item for updateItem (the API replaces masked fields only).
  const updated: forms_v1.Schema$Item = {
    ...item,
    questionItem: {
      question: {
        ...question,
        required: required ?? question.required,
      },
    },
  };
  if (title !== undefined) updated.title = title;
  if (description !== undefined) updated.description = description;

  const mask: string[] = [];
  if (title !== undefined) mask.push("title");
  if (description !== undefined) mask.push("description");
  if (required !== undefined) mask.push("question_item.question.required");
  if (options !== undefined) {
    if (question.choiceQuestion) {
      // Set the field on the question built above instead of replacing the
      // whole questionItem, which would drop a `required` change from this call.
      const updatedQuestion = updated.questionItem?.question;
      if (!updatedQuestion) throw new Error(`Item at index ${idx} has no question`);
      updatedQuestion.choiceQuestion = {
        ...question.choiceQuestion,
        options: options.map((value) => ({ value })),
      };
      mask.push("question_item.question.choice_question.options");
    } else {
      throw new Error(`Question ${questionId} is not a choice question`);
    }
  }
  if (mask.length === 0) return { updated: true };

  await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests: [
        {
          updateItem: {
            location: { index: idx },
            item: updated,
            updateMask: mask.join(","),
          },
        },
      ],
    },
  });
  return { updated: true };
}

export async function deleteFormQuestion(
  client: Auth.OAuth2Client,
  { formId, questionId }: { formId: string; questionId: string },
): Promise<{ deleted: boolean }> {
  const forms = google.forms({ version: "v1", auth: client });
  const idx = await locateQuestionIndex(client, formId, questionId);
  await forms.forms.batchUpdate({
    formId,
    requestBody: { requests: [{ deleteItem: { location: { index: idx } } }] },
  });
  return { deleted: true };
}

export async function moveFormQuestion(
  client: Auth.OAuth2Client,
  { formId, questionId, newIndex }: { formId: string; questionId: string; newIndex: number },
): Promise<{ moved: boolean }> {
  const forms = google.forms({ version: "v1", auth: client });
  const idx = await locateQuestionIndex(client, formId, questionId);
  await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests: [
        {
          moveItem: {
            originalLocation: { index: idx },
            newLocation: { index: newIndex },
          },
        },
      ],
    },
  });
  return { moved: true };
}

export async function renameForm(
  client: Auth.OAuth2Client,
  { formId, title }: { formId: string; title: string },
): Promise<{ renamed: boolean }> {
  const forms = google.forms({ version: "v1", auth: client });
  await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests: [{ updateFormInfo: { info: { title }, updateMask: "title" } }],
    },
  });
  return { renamed: true };
}

/** Delete a form (forms live in Drive, so this deletes the Drive file). */
export async function deleteForm(
  client: Auth.OAuth2Client,
  { formId }: { formId: string },
): Promise<{ deleted: boolean; formId: string }> {
  const drive = google.drive({ version: "v3", auth: client });
  await drive.files.delete({ fileId: formId });
  return { deleted: true, formId };
}

export interface ExportResponsesArgs {
  formId: string;
  spreadsheetId: string;
  sheetName?: string;
}

/** Quote a sheet name for A1 notation; apostrophes are doubled. */
function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

const RESPONSE_ID_HEADER = "__google_forms_response_id";
const RESPONSE_ID_HEADER_PATTERN = /^__google_forms_response_id(?:_\d+)?$/;

/** Normalized row identity, used only to recognize rows from older exports. */
function rowKey(row: unknown[]): string {
  return JSON.stringify(row.map((cell) => String(cell ?? "").trim()));
}

function responseIdHeader(headers: string[]): string {
  let header = RESPONSE_ID_HEADER;
  let suffix = 2;
  while (headers.includes(header)) header = `${RESPONSE_ID_HEADER}_${suffix++}`;
  return header;
}

function columnName(index: number): string {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function questionColumn(questionIndex: number, responseIdColumn: number): number {
  return questionIndex < responseIdColumn ? questionIndex : questionIndex + 1;
}

async function appendSheetHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  startColumn: number,
  headers: string[],
): Promise<void> {
  if (headers.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(sheetName)}!${columnName(startColumn)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}

/** Existing values in the tab; empty when the tab does not exist yet. */
async function readSheetRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<unknown[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quoteSheetName(sheetName)}!A:ZZ`,
    });
    return (res.data.values ?? []) as unknown[][];
  } catch (error) {
    // A tab that does not exist is a valid empty destination. Anything else
    // (permissions, bad id) must not be mistaken for an empty sheet: appending
    // on top of an unreadable tab would duplicate everything already there.
    const message = error instanceof Error ? error.message : String(error);
    if (/unable to parse range/i.test(message)) return [];
    throw error;
  }
}

/** Append form responses, using response IDs for stable deduplication. */
export async function exportFormResponsesToSheet(
  client: Auth.OAuth2Client,
  { formId, spreadsheetId, sheetName = "Sheet1" }: ExportResponsesArgs,
): Promise<{ appendedRows: number; responses: number; skippedExisting: number }> {
  const [form, responses] = await Promise.all([
    getForm(client, { formId }),
    getAllFormResponses(client, { formId }),
  ]);
  const questions = (form.items ?? []).filter((i) => i.questionItem?.question);
  const headers = questions.map((i) => i.title ?? "Untitled");
  const rows = responses.map((response) => ({
    responseId: response.responseId ?? "",
    values: questions.map((i) => {
      const qid = i.questionItem?.question?.questionId;
      const ans = qid ? response.answers?.[qid] : undefined;
      const values = ans?.textAnswers?.answers?.map((a) => a.value ?? "") ?? [];
      return values.join("; ");
    }),
  }));
  const sheets = google.sheets({ version: "v4", auth: client });
  const existing = await readSheetRows(sheets, spreadsheetId, sheetName);
  const idHeader = responseIdHeader(headers);
  const existingHeaders = existing[0] ?? [];
  const existingDataRows = existing.slice(1);
  let headerWidth = existingHeaders.length;
  let responseIdColumn = headers.length;
  if (existing.length > 0) {
    const responseIds = new Set(rows.map((response) => response.responseId.trim()).filter(Boolean));
    const candidates = existingHeaders
      .map((cell, index) => (RESPONSE_ID_HEADER_PATTERN.test(String(cell ?? "")) ? index : -1))
      .filter((index) => index >= 0);
    const exactHeaderColumn = existingHeaders.findIndex((cell) => String(cell ?? "") === idHeader);
    responseIdColumn = exactHeaderColumn;
    if (responseIdColumn < 0 && candidates.length > 0) {
      const matchingCandidates = candidates.map((candidate) => ({
        column: candidate,
        matches: existingDataRows.filter((row) =>
          responseIds.has(String(row[candidate] ?? "").trim()),
        ).length,
      }));
      const matchingMetadata = matchingCandidates.filter(({ matches }) => matches > 0);
      if (matchingMetadata.length > 0) {
        responseIdColumn = matchingMetadata.reduce((best, candidate) =>
          candidate.matches > best.matches ? candidate : best,
        ).column;
      } else if (
        existingDataRows.some((row) =>
          candidates.some((candidate) => String(row[candidate] ?? "").trim()),
        )
      ) {
        throw new Error(
          "Cannot identify response ID column; rename reserved question headers or reconcile the sheet before exporting.",
        );
      }
    }
    if (
      exactHeaderColumn < 0 &&
      candidates.length > 1 &&
      responseIdColumn >= 0 &&
      responseIds.size > 0
    ) {
      responseIdColumn = candidates.reduce((best, candidate) => {
        const score = existingDataRows.filter((row) =>
          responseIds.has(String(row[candidate] ?? "").trim()),
        ).length;
        const bestScore = existingDataRows.filter((row) =>
          responseIds.has(String(row[best] ?? "").trim()),
        ).length;
        if (score !== bestScore) return score > bestScore ? candidate : best;
        const populated = existingDataRows.filter((row) =>
          String(row[candidate] ?? "").trim(),
        ).length;
        const bestPopulated = existingDataRows.filter((row) =>
          String(row[best] ?? "").trim(),
        ).length;
        return populated > bestPopulated ? candidate : best;
      });
    }
  }
  if (existing.length > 0 && responseIdColumn < 0) {
    responseIdColumn = Math.max(existingHeaders.length, headers.length);
  }

  if (existing.length > 0) {
    const questionColumns = new Map(
      headers.map((header, index) => [questionColumn(index, responseIdColumn), header]),
    );
    for (const [index, cell] of existingHeaders.entries()) {
      const value = String(cell ?? "");
      if (!value || index === responseIdColumn) continue;
      if (questionColumns.get(index) !== value) {
        throw new Error(
          "Form question order differs from sheet columns; reconcile the header row before exporting.",
        );
      }
    }
  }

  const values: string[][] = existing.length === 0 ? [[...headers, idHeader]] : [];

  const hasResponseIdColumn = responseIdColumn < existingHeaders.length;
  if (existing.length > 0 && !hasResponseIdColumn) {
    const addedHeaders = [...headers.slice(existingHeaders.length, responseIdColumn), idHeader];
    await appendSheetHeaders(
      sheets,
      spreadsheetId,
      sheetName,
      existingHeaders.length,
      addedHeaders,
    );
    headerWidth = responseIdColumn + 1;
  }

  if (existing.length > 0) {
    const finalQuestionColumn =
      headers.length === 0 ? -1 : questionColumn(headers.length - 1, responseIdColumn);
    const requiredColumns = Math.max(responseIdColumn + 1, finalQuestionColumn + 1);
    if (headerWidth < requiredColumns) {
      const addedHeaders = Array.from({ length: requiredColumns - headerWidth }, (_, offset) => {
        const column = headerWidth + offset;
        return headers[column - 1] ?? "";
      });
      await appendSheetHeaders(sheets, spreadsheetId, sheetName, headerWidth, addedHeaders);
    }
  }

  const existingResponseIds = new Set(
    existingDataRows.map((row) => String(row[responseIdColumn] ?? "").trim()).filter(Boolean),
  );
  const legacyCounts = new Map<string, number>();
  const legacyRows = new Map<string, number[]>();
  for (const [index, row] of existingDataRows.entries()) {
    if (String(row[responseIdColumn] ?? "").trim()) continue;
    const answerValues = headers.map(
      (_, index) => row[questionColumn(index, responseIdColumn)] ?? "",
    );
    const key = rowKey(answerValues);
    legacyCounts.set(key, (legacyCounts.get(key) ?? 0) + 1);
    const rowNumbers = legacyRows.get(key) ?? [];
    rowNumbers.push(index + 2);
    legacyRows.set(key, rowNumbers);
  }

  let skippedExisting = 0;
  const legacyIdWrites: Array<{ range: string; values: string[][] }> = [];
  for (const response of rows) {
    const responseId = response.responseId.trim();
    if (responseId && existingResponseIds.has(responseId)) {
      skippedExisting += 1;
      continue;
    }
    const key = rowKey(response.values);
    const legacyCount = legacyCounts.get(key) ?? 0;
    if (legacyCount > 0) {
      legacyCounts.set(key, legacyCount - 1);
      const rowNumber = legacyRows.get(key)?.shift();
      if (responseId) {
        if (rowNumber !== undefined) {
          legacyIdWrites.push({
            range: `${quoteSheetName(sheetName)}!${columnName(responseIdColumn)}${rowNumber}`,
            values: [[responseId]],
          });
        }
        existingResponseIds.add(responseId);
      }
      skippedExisting += 1;
      continue;
    }

    const finalQuestionColumn =
      response.values.length === 0
        ? -1
        : questionColumn(response.values.length - 1, responseIdColumn);
    const row = Array.from(
      { length: Math.max(responseIdColumn, finalQuestionColumn) + 1 },
      () => "",
    );
    response.values.forEach((answer, index) => {
      row[questionColumn(index, responseIdColumn)] = answer;
    });
    row[responseIdColumn] = responseId;
    values.push(row);
    if (responseId) existingResponseIds.add(responseId);
  }
  if (legacyIdWrites.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: legacyIdWrites },
    });
  }
  if (values.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quoteSheetName(sheetName)}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  }
  return { appendedRows: values.length, responses: rows.length, skippedExisting };
}

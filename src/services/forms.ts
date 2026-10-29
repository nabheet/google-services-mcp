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

/** Normalized row identity, so a re-run can tell what is already exported. */
function rowKey(row: unknown[]): string {
  return JSON.stringify(row.map((cell) => String(cell ?? "").trim()));
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

/** Append form responses (headers + rows) to a spreadsheet tab, once. */
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
  const rows = responses.map((r) =>
    questions.map((i) => {
      const qid = i.questionItem?.question?.questionId;
      const ans = qid ? r.answers?.[qid] : undefined;
      const values = ans?.textAnswers?.answers?.map((a) => a.value ?? "") ?? [];
      return values.join("; ");
    }),
  );
  const sheets = google.sheets({ version: "v4", auth: client });
  const existing = await readSheetRows(sheets, spreadsheetId, sheetName);
  const existingKeys = new Set(existing.map(rowKey));
  const values: string[][] = existing.length === 0 ? [headers] : [];
  let skippedExisting = 0;
  for (const row of rows) {
    if (existingKeys.has(rowKey(row))) {
      skippedExisting += 1;
      continue;
    }
    values.push(row);
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

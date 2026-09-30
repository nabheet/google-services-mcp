import type { Auth, forms_v1 } from "googleapis";
import { google } from "googleapis";

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
  { formId, pageSize = 100 }: GetFormArgs & { pageSize?: number },
): Promise<forms_v1.Schema$FormResponse[]> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.responses.list({ formId, pageSize });
  return res.data.responses ?? [];
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
  await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests: [
        {
          createItem: {
            location: { index: 0 },
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
      const q = updated.questionItem!.question!;
      q.choiceQuestion = {
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

/** Append form responses (headers + rows) to a spreadsheet tab. */
export async function exportFormResponsesToSheet(
  client: Auth.OAuth2Client,
  { formId, spreadsheetId, sheetName = "Sheet1" }: ExportResponsesArgs,
): Promise<{ appendedRows: number; responses: number }> {
  const [form, responses] = await Promise.all([
    getForm(client, { formId }),
    getFormResponses(client, { formId }),
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
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers, ...rows] },
  });
  return {
    appendedRows: res.data.updates?.updatedRows ?? rows.length + 1,
    responses: rows.length,
  };
}

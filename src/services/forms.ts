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

export async function getForm(client: Auth.OAuth2Client, { formId }: GetFormArgs): Promise<any> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.get({ formId });
  return res.data;
}

export async function getFormResponses(
  client: Auth.OAuth2Client,
  { formId, pageSize = 100 }: GetFormArgs & { pageSize?: number }
): Promise<any[]> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await (forms as any).forms_responses.list({ formId, pageSize });
  return res.data.responses ?? [];
}

export async function createForm(client: Auth.OAuth2Client, { title }: { title: string }): Promise<any> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.create({ requestBody: { info: { title } } });
  return res.data;
}

export async function addQuestion(
  client: Auth.OAuth2Client,
  { formId, title, description, type = "text" as const, options, required = false }: AddQuestionArgs
): Promise<any> {
  const forms = google.forms({ version: "v1", auth: client });
  let question: Record<string, unknown>;
  if (type === "multiple_choice") {
    question = {
      questionId: "q",
      required,
      choiceQuestion: {
        type: "RADIO",
        options: (options ?? []).map((value) => ({ value })),
        shuffle: false,
      },
    };
  } else {
    question = { questionId: "q", required, textQuestion: {} };
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
  { formId, requests }: BatchUpdateArgs
): Promise<any> {
  const forms = google.forms({ version: "v1", auth: client });
  const res = await forms.forms.batchUpdate({ formId, requestBody: { requests } });
  return res.data;
}

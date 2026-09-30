import { beforeEach, describe, expect, it, vi } from "vitest";

const mockForms = {
  forms: {
    get: vi.fn(),
    create: vi.fn(),
    batchUpdate: vi.fn(),
    responses: {
      list: vi.fn(),
    },
  },
};

const mockDriveFiles = { delete: vi.fn() };
const mockSheetsValues = { append: vi.fn() };

vi.mock("googleapis", () => ({
  google: {
    forms: vi.fn(() => mockForms),
    drive: vi.fn(() => ({ files: mockDriveFiles })),
    sheets: vi.fn(() => ({ spreadsheets: { values: mockSheetsValues } })),
  },
}));

const client = {} as never;

import {
  addQuestion,
  createForm,
  deleteForm,
  deleteFormQuestion,
  exportFormResponsesToSheet,
  getForm,
  getFormResponses,
  moveFormQuestion,
  renameForm,
  updateFormQuestion,
} from "../src/services/forms.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("forms service", () => {
  it("getForm returns raw form", async () => {
    mockForms.forms.get.mockResolvedValue({ data: { formId: "f1", info: { title: "Survey" } } });
    const result = await getForm(client, { formId: "f1" });
    expect(result.info.title).toBe("Survey");
    expect(mockForms.forms.get).toHaveBeenCalledWith({ formId: "f1" });
  });

  it("getFormResponses lists responses with flatten", async () => {
    mockForms.forms.responses.list.mockResolvedValue({
      data: {
        responses: [
          { responseId: "r1", answers: { q1: { textAnswers: { answers: [{ value: "yes" }] } } } },
        ],
      },
    });
    const result = await getFormResponses(client, { formId: "f1" });
    expect(result).toEqual([
      { responseId: "r1", answers: { q1: { textAnswers: { answers: [{ value: "yes" }] } } } },
    ]);
    expect(mockForms.forms.responses.list).toHaveBeenCalledWith({ formId: "f1", pageSize: 100 });
  });

  it("getFormResponses returns empty array when none", async () => {
    mockForms.forms.responses.list.mockResolvedValue({ data: {} });
    const result = await getFormResponses(client, { formId: "f1" });
    expect(result).toEqual([]);
  });

  it("createForm creates with title and returns id + responderUri", async () => {
    mockForms.forms.create.mockResolvedValue({
      data: { formId: "f2", responderUri: "https://docs.google.com/forms/d/f2" },
    });
    const result = await createForm(client, { title: "New survey" });
    expect(result.formId).toBe("f2");
    expect(result.responderUri).toContain("f2");
    expect(mockForms.forms.create).toHaveBeenCalledWith({
      requestBody: { info: { title: "New survey" } },
    });
  });

  it("addQuestion appends a text question", async () => {
    mockForms.forms.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    const result = await addQuestion(client, {
      formId: "f1",
      title: "What is your name?",
      description: "Optional",
    });
    expect(result).toEqual({ added: true });
    const body = mockForms.forms.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].createItem).toMatchObject({
      location: { index: 0 },
      item: {
        title: "What is your name?",
        description: "Optional",
        questionItem: { question: { required: false, textQuestion: {} } },
      },
    });
    expect(body.requests[0].createItem.item.questionItem.question.questionId).toBeUndefined();
  });

  it("addQuestion supports multiple choice", async () => {
    mockForms.forms.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    await addQuestion(client, {
      formId: "f1",
      title: "Pick one",
      type: "multiple_choice",
      options: ["A", "B"],
    });
    const body = mockForms.forms.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].createItem.item.questionItem.question.choiceQuestion).toEqual({
      type: "RADIO",
      options: [{ value: "A" }, { value: "B" }],
      shuffle: false,
    });
  });

  it("propagates API errors", async () => {
    mockForms.forms.get.mockRejectedValue(new Error("forbidden"));
    await expect(getForm(client, { formId: "x" })).rejects.toThrow("forbidden");
  });
});

describe("updateFormQuestion", () => {
  const form = {
    data: {
      formId: "f1",
      items: [
        {
          itemId: "i1",
          title: "Old title",
          description: "Old desc",
          questionItem: {
            question: {
              questionId: "q1",
              required: false,
              choiceQuestion: { type: "RADIO", options: [{ value: "A" }] },
            },
          },
        },
      ],
    },
  };

  it("updates title/description/required with located index and mask", async () => {
    mockForms.forms.get.mockResolvedValue(form);
    mockForms.forms.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    const result = await updateFormQuestion(client, {
      formId: "f1",
      questionId: "q1",
      title: "New title",
      description: "New desc",
      required: true,
    });
    expect(result).toEqual({ updated: true });
    const body = mockForms.forms.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].updateItem.location).toEqual({ index: 0 });
    expect(body.requests[0].updateItem.item.title).toBe("New title");
    expect(body.requests[0].updateItem.item.description).toBe("New desc");
    expect(body.requests[0].updateItem.item.questionItem.question.required).toBe(true);
    expect(body.requests[0].updateItem.updateMask).toBe(
      "title,description,question_item.question.required",
    );
  });

  it("updates options on a choice question", async () => {
    mockForms.forms.get.mockResolvedValue(form);
    mockForms.forms.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    await updateFormQuestion(client, {
      formId: "f1",
      questionId: "q1",
      options: ["X", "Y"],
    });
    const req = mockForms.forms.batchUpdate.mock.calls[0][0].requestBody.requests[0].updateItem;
    expect(req.item.questionItem.question.choiceQuestion.options).toEqual([
      { value: "X" },
      { value: "Y" },
    ]);
    expect(req.updateMask).toBe("question_item.question.choice_question.options");
  });

  it("throws when questionId is not found", async () => {
    mockForms.forms.get.mockResolvedValue(form);
    await expect(
      updateFormQuestion(client, { formId: "f1", questionId: "nope", title: "T" }),
    ).rejects.toThrow("Question nope not found");
  });

  it("throws when options are set on a text question", async () => {
    mockForms.forms.get.mockResolvedValue({
      data: {
        formId: "f1",
        items: [
          {
            itemId: "i1",
            title: "T",
            questionItem: { question: { questionId: "q1", textQuestion: {} } },
          },
        ],
      },
    });
    await expect(
      updateFormQuestion(client, { formId: "f1", questionId: "q1", options: ["A"] }),
    ).rejects.toThrow("not a choice question");
  });
});

describe("deleteFormQuestion", () => {
  it("locates the item index and deletes it", async () => {
    mockForms.forms.get.mockResolvedValue({
      data: {
        formId: "f1",
        items: [
          { itemId: "i1", questionItem: { question: { questionId: "q1" } } },
          { itemId: "i2", questionItem: { question: { questionId: "q2" } } },
        ],
      },
    });
    mockForms.forms.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    const result = await deleteFormQuestion(client, { formId: "f1", questionId: "q2" });
    expect(result).toEqual({ deleted: true });
    const body = mockForms.forms.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].deleteItem.location).toEqual({ index: 1 });
  });
});

describe("moveFormQuestion", () => {
  it("moves by original location to new index", async () => {
    mockForms.forms.get.mockResolvedValue({
      data: {
        formId: "f1",
        items: [
          { itemId: "i1", questionItem: { question: { questionId: "q1" } } },
          { itemId: "i2", questionItem: { question: { questionId: "q2" } } },
          { itemId: "i3", questionItem: { question: { questionId: "q3" } } },
        ],
      },
    });
    mockForms.forms.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    const result = await moveFormQuestion(client, {
      formId: "f1",
      questionId: "q1",
      newIndex: 2,
    });
    expect(result).toEqual({ moved: true });
    const body = mockForms.forms.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].moveItem).toEqual({
      originalLocation: { index: 0 },
      newLocation: { index: 2 },
    });
  });
});

describe("renameForm / deleteForm", () => {
  it("renameForm updates info.title with mask", async () => {
    mockForms.forms.batchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    const result = await renameForm(client, { formId: "f1", title: "Renamed" });
    expect(result).toEqual({ renamed: true });
    const body = mockForms.forms.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].updateFormInfo).toEqual({
      info: { title: "Renamed" },
      updateMask: "title",
    });
  });

  it("deleteForm deletes the Drive file", async () => {
    mockDriveFiles.delete.mockResolvedValue({ data: {} });
    const result = await deleteForm(client, { formId: "f1" });
    expect(result).toEqual({ deleted: true, formId: "f1" });
    expect(mockDriveFiles.delete).toHaveBeenCalledWith({ fileId: "f1" });
  });
});

describe("exportFormResponsesToSheet", () => {
  const form = {
    data: {
      formId: "f1",
      items: [
        { itemId: "i1", title: "Name", questionItem: { question: { questionId: "q1" } } },
        { itemId: "i2", title: "Rating", questionItem: { question: { questionId: "q2" } } },
      ],
    },
  };

  it("appends headers and flattened response rows", async () => {
    mockForms.forms.get.mockResolvedValue(form);
    mockForms.forms.responses.list.mockResolvedValue({
      data: {
        responses: [
          {
            responseId: "r1",
            answers: {
              q1: { textAnswers: { answers: [{ value: "Alice" }] } },
              q2: { textAnswers: { answers: [{ value: "5" }, { value: "4" }] } },
            },
          },
        ],
      },
    });
    mockSheetsValues.append.mockResolvedValue({ data: { updates: { updatedRows: 2 } } });
    const result = await exportFormResponsesToSheet(client, {
      formId: "f1",
      spreadsheetId: "s1",
    });
    expect(result).toMatchObject({ appendedRows: 2 });
    expect(mockSheetsValues.append).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          ["Name", "Rating"],
          ["Alice", "5; 4"],
        ],
      },
    });
  });

  it("writes headers only when there are no responses", async () => {
    mockForms.forms.get.mockResolvedValue(form);
    mockForms.forms.responses.list.mockResolvedValue({ data: {} });
    mockSheetsValues.append.mockResolvedValue({ data: { updates: { updatedRows: 1 } } });
    const result = await exportFormResponsesToSheet(client, {
      formId: "f1",
      spreadsheetId: "s1",
      sheetName: "Data",
    });
    expect(mockSheetsValues.append).toHaveBeenCalledWith({
      spreadsheetId: "s1",
      range: "Data!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Name", "Rating"]] },
    });
    expect(result).toMatchObject({ appendedRows: 1, responses: 0 });
  });
});

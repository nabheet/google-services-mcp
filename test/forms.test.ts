import { describe, expect, it, vi, beforeEach } from "vitest";
import { google } from "googleapis";

const mockForms = {
  forms: {
    get: vi.fn(),
    create: vi.fn(),
    batchUpdate: vi.fn(),
  },
  forms_responses: {
    list: vi.fn(),
  },
};

vi.mock("googleapis", () => ({
  google: {
    forms: vi.fn(() => mockForms),
  },
}));

const client = {} as never;

import {
  getForm,
  getFormResponses,
  createForm,
  addQuestion,
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
    mockForms.forms_responses.list.mockResolvedValue({
      data: {
        responses: [{ responseId: "r1", answers: { q1: { textAnswers: { answers: [{ value: "yes" }] } } } }],
      },
    });
    const result = await getFormResponses(client, { formId: "f1" });
    expect(result).toEqual([
      { responseId: "r1", answers: { q1: { textAnswers: { answers: [{ value: "yes" }] } } } },
    ]);
    expect(mockForms.forms_responses.list).toHaveBeenCalledWith({ formId: "f1", pageSize: 100 });
  });

  it("getFormResponses returns empty array when none", async () => {
    mockForms.forms_responses.list.mockResolvedValue({ data: {} });
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
        questionItem: { question: { questionId: "q", required: false, textQuestion: {} } },
      },
    });
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

import { describe, expect, it, vi, beforeEach } from "vitest";
import { google } from "googleapis";

const mockPresentations = {
  get: vi.fn(),
  create: vi.fn(),
  batchUpdate: vi.fn(),
  pages: { get: vi.fn() },
};

vi.mock("googleapis", () => ({
  google: {
    slides: vi.fn(() => ({ presentations: mockPresentations })),
  },
}));

const client = {} as never;

import {
  getPresentation,
  getSlidePage,
  createPresentation,
  replaceAllText,
  createSlide,
  deleteSlide,
} from "../src/services/slides.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("slides service", () => {
  it("getPresentation returns raw presentation", async () => {
    mockPresentations.get.mockResolvedValue({ data: { presentationId: "p1", title: "Deck" } });
    const result = await getPresentation(client, { presentationId: "p1" });
    expect(result.title).toBe("Deck");
    expect(mockPresentations.get).toHaveBeenCalledWith({ presentationId: "p1" });
  });

  it("getSlidePage fetches a page by id", async () => {
    mockPresentations.pages.get.mockResolvedValue({ data: { objectId: "page1" } });
    const result = await getSlidePage(client, { presentationId: "p1", pageObjectId: "page1" });
    expect(result.objectId).toBe("page1");
  });

  it("createPresentation creates with title", async () => {
    mockPresentations.create.mockResolvedValue({ data: { presentationId: "p2", title: "New deck" } });
    const result = await createPresentation(client, { title: "New deck" });
    expect(result.presentationId).toBe("p2");
    expect(mockPresentations.create).toHaveBeenCalledWith({ requestBody: { title: "New deck" } });
  });

  it("replaceAllText replaces across the deck", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ replaceAllText: { occurrencesChanged: 3 } }] },
    });
    const result = await replaceAllText(client, { presentationId: "p1", find: "{{x}}", replace: "Y" });
    expect(result.occurrencesChanged).toBe(3);
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].replaceAllText).toEqual({
      containsText: { text: "{{x}}", matchCase: true },
      replaceText: "Y",
    });
  });

  it("createSlide adds a blank slide and returns its id", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ createSlide: { objectId: "newslide1" } }] },
    });
    const result = await createSlide(client, { presentationId: "p1" });
    expect(result.objectId).toBe("newslide1");
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].createSlide).toEqual({ slideLayoutReference: { predefinedLayout: "BLANK" } });
  });

  it("deleteSlide removes a slide", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    const result = await deleteSlide(client, { presentationId: "p1", slideObjectId: "s3" });
    expect(result).toEqual({ deleted: true });
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].deleteObject).toEqual({ objectId: "s3" });
  });

  it("propagates API errors", async () => {
    mockPresentations.get.mockRejectedValue(new Error("denied"));
    await expect(getPresentation(client, { presentationId: "p1" })).rejects.toThrow("denied");
  });
});

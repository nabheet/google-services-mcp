import { beforeEach, describe, expect, it, vi } from "vitest";

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
  createImage,
  createPresentation,
  createSlide,
  createTextbox,
  deleteSlide,
  duplicateSlide,
  getPresentation,
  getSlidePage,
  moveSlide,
  replaceAllText,
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
    mockPresentations.create.mockResolvedValue({
      data: { presentationId: "p2", title: "New deck" },
    });
    const result = await createPresentation(client, { title: "New deck" });
    expect(result.presentationId).toBe("p2");
    expect(mockPresentations.create).toHaveBeenCalledWith({ requestBody: { title: "New deck" } });
  });

  it("replaceAllText replaces across the deck", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ replaceAllText: { occurrencesChanged: 3 } }] },
    });
    const result = await replaceAllText(client, {
      presentationId: "p1",
      find: "{{x}}",
      replace: "Y",
    });
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
    expect(body.requests[0].createSlide).toEqual({
      slideLayoutReference: { predefinedLayout: "BLANK" },
    });
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

  it("duplicateSlide duplicates a slide and returns the new id", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ duplicateObject: { objectId: "dup1" } }] },
    });
    const result = await duplicateSlide(client, {
      presentationId: "p1",
      slideObjectId: "s1",
    });
    expect(result.objectId).toBe("dup1");
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].duplicateObject).toEqual({ objectId: "s1" });
  });

  it("moveSlide reorders a slide to insertionIndex", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ updateSlidesPosition: { slideObjectIds: ["s2"], insertionIndex: 1 } }] },
    });
    const result = await moveSlide(client, {
      presentationId: "p1",
      slideObjectId: "s2",
      insertionIndex: 1,
    });
    expect(result.insertionIndex).toBe(1);
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].updateSlidesPosition).toEqual({
      slideObjectIds: ["s2"],
      insertionIndex: 1,
    });
  });

  it("createTextbox adds a text box with text", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ createShape: { objectId: "tb1" } }] },
    });
    const result = await createTextbox(client, {
      presentationId: "p1",
      pageObjectId: "page1",
      text: "Hello",
    });
    expect(result.objectId).toBe("tb1");
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].createShape.shapeType).toBe("TEXT_BOX");
    expect(body.requests[0].createShape.elementProperties.pageObjectId).toBe("page1");
    expect(body.requests[0].createShape.objectId).toBe(body.requests[1].insertText.objectId);
    expect(body.requests[1].insertText).toMatchObject({
      insertionIndex: 0,
      text: "Hello",
    });
  });

  it("createTextbox without text sends only the shape request", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({ data: { replies: [] } });
    await createTextbox(client, { presentationId: "p1", pageObjectId: "page1" });
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests).toHaveLength(1);
  });

  it("createImage inserts an image by url", async () => {
    mockPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ createImage: { objectId: "img1" } }] },
    });
    const result = await createImage(client, {
      presentationId: "p1",
      pageObjectId: "page1",
      url: "https://example.com/pic.png",
    });
    expect(result.objectId).toBe("img1");
    const body = mockPresentations.batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0].createImage.url).toBe("https://example.com/pic.png");
    expect(body.requests[0].createImage.elementProperties.pageObjectId).toBe("page1");
  });
});

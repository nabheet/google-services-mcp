import { describe, expect, it, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const mockGmailMessages = { send: vi.fn(), list: vi.fn(), get: vi.fn(), modify: vi.fn() };
const mockEvents = { list: vi.fn(), insert: vi.fn() };
const mockFiles = { list: vi.fn() };
const mockTaskItems = { list: vi.fn(), insert: vi.fn() };
const mockSheetValues = { get: vi.fn(), update: vi.fn(), append: vi.fn() };
const mockDocsDocuments = { get: vi.fn(), create: vi.fn(), batchUpdate: vi.fn() };
const mockSlidesPresentations = { get: vi.fn(), create: vi.fn(), batchUpdate: vi.fn() };
const mockYouTubeSearch = { list: vi.fn() };
const mockFormsGet = vi.fn();
const mockFormsResponses = { list: vi.fn() };

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({ users: { messages: mockGmailMessages } })),
    calendar: vi.fn(() => ({ events: mockEvents, calendarList: { list: vi.fn().mockResolvedValue({ data: {} }) } })),
    drive: vi.fn(() => ({ files: mockFiles, permissions: { create: vi.fn(), delete: vi.fn() } })),
    people: vi.fn(() => ({
      people: { connections: { list: vi.fn().mockResolvedValue({ data: {} }), create: vi.fn() } },
      otherContacts: { search: vi.fn().mockResolvedValue({ data: {} }) },
    })),
    tasks: vi.fn(() => ({ tasklists: { list: vi.fn().mockResolvedValue({ data: {} }) }, tasks: mockTaskItems })),
    sheets: vi.fn(() => ({
      spreadsheets: { get: vi.fn(), create: vi.fn(), batchUpdate: vi.fn(), values: mockSheetValues },
    })),
    docs: vi.fn(() => ({ documents: mockDocsDocuments })),
    slides: vi.fn(() => ({ presentations: mockSlidesPresentations, pages: { get: vi.fn() } })),
    youtube: vi.fn(() => ({
      search: mockYouTubeSearch,
      videos: { list: vi.fn(), rate: vi.fn() },
      playlists: { list: vi.fn(), insert: vi.fn(), delete: vi.fn() },
      playlistItems: { list: vi.fn(), insert: vi.fn() },
      subscriptions: { list: vi.fn() },
    })),
    forms: vi.fn(() => ({
      forms: { get: mockFormsGet, create: vi.fn(), batchUpdate: vi.fn() },
      forms_responses: mockFormsResponses,
    })),
  },
}));

vi.mock("../src/auth/manager.js", () => ({
  authManager: {
    getClient: vi.fn(async () => ({ fake: true })),
    listAccounts: vi.fn(async () => [{ name: "personal", email: "alice@example.com" }]),
    getStatus: vi.fn(async () => ({
      credentialsConfigured: true,
      dataDir: "/tmp/x",
      defaultAccount: "personal",
      accounts: [{ name: "personal", tokenHealthy: true, scopes: [] }],
    })),
    addAccount: vi.fn(),
    removeAccount: vi.fn(),
    setDefaultAccount: vi.fn(),
  },
}));

import { createServer } from "../src/server.js";

let client: Client;
let serverSide: ReturnType<typeof createServer>;

async function setup() {
  serverSide = createServer();
  client = new Client({ name: "test-client", version: "0.0.1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await serverSide.connect(a);
  await client.connect(b);
}

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse((res.content as Array<{ text: string }>)[0].text) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("server tool registration", () => {
  it("exposes all google_ tools", async () => {
    await setup();
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain("google_account_add");
    expect(names).toContain("google_gmail_send");
    expect(names).toContain("google_gmail_list");
    expect(names).toContain("google_gmail_get");
    expect(names).toContain("google_gmail_modify");
    expect(names).toContain("google_gmail_reply");
    expect(names).toContain("google_calendar_list_calendars");
    expect(names).toContain("google_calendar_list_events");
    expect(names).toContain("google_calendar_create_event");
    expect(names).toContain("google_calendar_create_meet");
    expect(names).toContain("google_calendar_get_event");
    expect(names).toContain("google_calendar_update_event");
    expect(names).toContain("google_calendar_delete_event");
    expect(names).toContain("google_drive_list");
    expect(names).toContain("google_drive_get");
    expect(names).toContain("google_drive_upload");
    expect(names).toContain("google_drive_update");
    expect(names).toContain("google_drive_delete");
    expect(names).toContain("google_drive_share");
    expect(names).toContain("google_contacts_list");
    expect(names).toContain("google_contacts_search");
    expect(names).toContain("google_contacts_create");
    expect(names).toContain("google_tasks_list_lists");
    expect(names).toContain("google_tasks_list");
    expect(names).toContain("google_tasks_create");
    expect(names).toContain("google_tasks_complete");
    expect(names).toContain("google_tasks_delete");
    expect(names).toContain("google_sheets_get");
    expect(names).toContain("google_sheets_read");
    expect(names).toContain("google_sheets_write");
    expect(names).toContain("google_sheets_append");
    expect(names).toContain("google_sheets_create");
    expect(names).toContain("google_sheets_batch_update");
    expect(names).toContain("google_docs_get");
    expect(names).toContain("google_docs_read");
    expect(names).toContain("google_docs_create");
    expect(names).toContain("google_docs_insert_text");
    expect(names).toContain("google_docs_replace_text");
    expect(names).toContain("google_docs_batch_update");
    expect(names).toContain("google_slides_get");
    expect(names).toContain("google_slides_create");
    expect(names).toContain("google_slides_replace_text");
    expect(names).toContain("google_slides_add_slide");
    expect(names).toContain("google_slides_delete_slide");
    expect(names).toContain("google_youtube_search");
    expect(names).toContain("google_youtube_get_video");
    expect(names).toContain("google_youtube_my_videos");
    expect(names).toContain("google_youtube_list_playlists");
    expect(names).toContain("google_youtube_create_playlist");
    expect(names).toContain("google_youtube_delete_playlist");
    expect(names).toContain("google_youtube_add_to_playlist");
    expect(names).toContain("google_youtube_subscriptions");
    expect(names).toContain("google_forms_get");
    expect(names).toContain("google_forms_responses");
    expect(names).toContain("google_forms_create");
    expect(names).toContain("google_forms_add_question");
    expect(names.length).toBe(60);
  });
});

describe("end-to-end tool calls", () => {
  it("google_gmail_send calls the service with the right args", async () => {
    await setup();
    mockGmailMessages.send.mockResolvedValue({ data: { id: "m1", threadId: "t1" } });
    const result = await callTool("google_gmail_send", {
      to: "a@example.com",
      subject: "Hi",
      body: "Hello",
    });
    expect(result).toEqual({ id: "m1", threadId: "t1" });
    expect(mockGmailMessages.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "me", requestBody: { raw: expect.any(String) } })
    );
  });

  it("google_gmail_list maps results", async () => {
    await setup();
    mockGmailMessages.list.mockResolvedValue({ data: { messages: [{ id: "m1", threadId: "t1", snippet: "s" }] } });
    const result = await callTool("google_gmail_list", { query: "from:bob", maxResults: 5 });
    expect(result).toEqual([{ id: "m1", threadId: "t1", snippet: "s" }]);
  });

  it("google_calendar_create_meet creates a meeting with conference data", async () => {
    await setup();
    mockEvents.insert.mockResolvedValue({
      data: { id: "e1", hangoutLink: "https://meet.google.com/abc-defg-hij" },
    });
    const result = await callTool("google_calendar_create_meet", {
      summary: "Call",
      start: "2026-08-13T10:00:00-07:00",
      end: "2026-08-13T10:30:00-07:00",
    });
    expect(result).toMatchObject({ id: "e1" });
    const body = mockEvents.insert.mock.calls[0][0].requestBody;
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
  });

  it("google_drive_list lists files", async () => {
    await setup();
    mockFiles.list.mockResolvedValue({ data: { files: [{ id: "f1", name: "x.md" }] } });
    const result = await callTool("google_drive_list", {});
    expect(result).toEqual([{ id: "f1", name: "x.md" }]);
  });

  it("google_tasks_create creates a task", async () => {
    await setup();
    mockTaskItems.insert.mockResolvedValue({ data: { id: "t1", title: "Buy milk" } });
    const result = await callTool("google_tasks_create", { title: "Buy milk" });
    expect(result).toMatchObject({ id: "t1", title: "Buy milk" });
  });

  it("google_account_list reports accounts", async () => {
    await setup();
    const result = await callTool("google_account_list", {});
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].name).toBe("personal");
  });

  it("google_sheets_read reads values", async () => {
    await setup();
    mockSheetValues.get.mockResolvedValue({ data: { values: [["a", "b"], ["c", "d"]] } });
    const result = await callTool("google_sheets_read", { spreadsheetId: "s1", range: "A1:B2" });
    expect(result).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("google_docs_replace_text fills templates", async () => {
    await setup();
    mockDocsDocuments.batchUpdate.mockResolvedValue({
      data: { replies: [{ replaceAllText: { occurrencesChanged: 1 } }] },
    });
    const result = await callTool("google_docs_replace_text", {
      documentId: "d1",
      find: "{{name}}",
      replace: "Nabheet",
    });
    expect(result).toEqual({ occurrencesChanged: 1 });
  });

  it("google_slides_add_slide returns the new slide id", async () => {
    await setup();
    mockSlidesPresentations.batchUpdate.mockResolvedValue({
      data: { replies: [{ createSlide: { objectId: "slide9" } }] },
    });
    const result = await callTool("google_slides_add_slide", { presentationId: "p1" });
    expect(result.objectId).toBe("slide9");
  });

  it("google_youtube_search searches videos", async () => {
    await setup();
    mockYouTubeSearch.list.mockResolvedValue({
      data: { items: [{ id: { videoId: "v1" }, snippet: { title: "T" } }] },
    });
    const result = await callTool("google_youtube_search", { query: "cats" });
    expect(result).toEqual([{ id: "v1", type: "video", title: "T", channelTitle: undefined }]);
  });

  it("google_forms_responses lists responses", async () => {
    await setup();
    mockFormsResponses.list.mockResolvedValue({
      data: { responses: [{ responseId: "r1" }] },
    });
    const result = await callTool("google_forms_responses", { formId: "f1" });
    expect(result).toEqual([{ responseId: "r1" }]);
  });

  it("google_gmail_send returns a helpful error when the API fails", async () => {
    await setup();
    mockGmailMessages.send.mockRejectedValue(new Error("Invalid grant"));
    const res = await client.callTool({
      name: "google_gmail_send",
      arguments: { to: "a@b.com", subject: "S", body: "B" },
    });
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Error: Invalid grant");
  });
});

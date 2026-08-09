import { describe, expect, it, vi, beforeEach } from "vitest";

const mockConnections = { list: vi.fn(), create: vi.fn() };
const mockPeople = { searchContacts: vi.fn() };
const mockTasks = { list: vi.fn(), get: vi.fn() };
const mockTasksLists = { list: vi.fn() };
const mockTaskItems = { list: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() };

vi.mock("googleapis", () => ({
  google: {
    people: vi.fn(() => ({
      people: { connections: mockConnections, createContact: mockConnections.create },
      otherContacts: { search: mockPeople.searchContacts },
    })),
    tasks: vi.fn(() => ({
      tasklists: mockTasksLists,
      tasks: mockTaskItems,
    })),
  },
}));

import {
  listContacts,
  searchContacts,
  createContact,
  listTaskLists,
  listTasks,
  createTask,
  completeTask,
  deleteTask,
} from "../src/services/contacts-tasks.js";

const client = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listContacts", () => {
  it("lists connections with names and emails", async () => {
    mockConnections.list.mockResolvedValue({
      data: {
        connections: [
          {
            resourceName: "people/1",
            names: [{ displayName: "Alice Example" }],
            emailAddresses: [{ value: "bob@example.com" }],
          },
        ],
      },
    });
    const result = await listContacts(client, {});
    expect(mockConnections.list).toHaveBeenCalledWith(
      expect.objectContaining({ personFields: "names,emailAddresses,phoneNumbers" })
    );
    expect(result).toEqual([
      { resourceName: "people/1", name: "Alice Example", emails: ["bob@example.com"], phones: [] },
    ]);
  });
});

describe("searchContacts", () => {
  it("searches by query", async () => {
    mockPeople.searchContacts.mockResolvedValue({
      data: {
        results: [
          {
            person: {
              resourceName: "people/2",
              names: [{ displayName: "Bob Example" }],
              emailAddresses: [{ value: "me@example.com" }],
            },
          },
        ],
      },
    });
    const result = await searchContacts(client, { query: "bob" });
    expect(mockPeople.searchContacts).toHaveBeenCalledWith(
      expect.objectContaining({ query: "bob", readMask: "names,emailAddresses,phoneNumbers" })
    );
    expect(result[0]).toMatchObject({ resourceName: "people/2", name: "Bob Example" });
  });
});

describe("createContact", () => {
  it("creates a contact with name and email", async () => {
    mockConnections.create.mockResolvedValue({ data: { resourceName: "people/3" } });
    await createContact(client, {
      name: "Carol Example",
      email: "__VG_EMAIL_2a3a9bd93ab9__",
    });
    const call = mockConnections.create.mock.calls[0][0];
    expect(call.requestBody.names[0].givenName).toBe("Carol Example");
    expect(call.requestBody.names[0].displayName).toBe("Carol Example");
    expect(call.requestBody.emailAddresses[0].value).toBe("__VG_EMAIL_2a3a9bd93ab9__");
  });
});

describe("taskLists", () => {
  it("lists task lists", async () => {
    mockTasksLists.list.mockResolvedValue({ data: { items: [{ id: "tl1", title: "Errands" }] } });
    const result = await listTaskLists(client);
    expect(result).toEqual([{ id: "tl1", title: "Errands" }]);
  });
});

describe("listTasks", () => {
  it("lists tasks for a task list", async () => {
    mockTaskItems.list.mockResolvedValue({
      data: { items: [{ id: "t1", title: "Buy milk", status: "needsAction", due: "2026-08-10T00:00:00.000Z" }] },
    });
    const result = await listTasks(client, { tasklistId: "tl1" });
    expect(mockTaskItems.list).toHaveBeenCalledWith({ tasklist: "tl1" });
    expect(result[0]).toMatchObject({ id: "t1", title: "Buy milk" });
  });
});

describe("createTask", () => {
  it("creates a task in a list", async () => {
    mockTaskItems.insert.mockResolvedValue({ data: { id: "t2", title: "Pay rent" } });
    const result = await createTask(client, { tasklistId: "tl1", title: "Pay rent" });
    expect(mockTaskItems.insert).toHaveBeenCalledWith({
      tasklist: "tl1",
      requestBody: { title: "Pay rent" },
    });
    expect(result.id).toBe("t2");
  });
});

describe("completeTask", () => {
  it("marks a task completed", async () => {
    mockTaskItems.patch.mockResolvedValue({ data: { id: "t1", title: "Buy milk", status: "completed" } });
    const result = await completeTask(client, { tasklistId: "tl1", taskId: "t1" });
    expect(mockTaskItems.patch).toHaveBeenCalledWith({
      tasklist: "tl1",
      task: "t1",
      requestBody: { status: "completed" },
    });
    expect(result.status).toBe("completed");
  });
});

describe("deleteTask", () => {
  it("deletes a task", async () => {
    mockTaskItems.delete.mockResolvedValue({ data: {} });
    await deleteTask(client, { tasklistId: "tl1", taskId: "t1" });
    expect(mockTaskItems.delete).toHaveBeenCalledWith({ tasklist: "tl1", task: "t1" });
  });
});

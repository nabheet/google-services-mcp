import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnections = { list: vi.fn(), create: vi.fn(), update: vi.fn(), get: vi.fn() };
const mockPeople = { searchContacts: vi.fn() };
const mockTasksLists = { list: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() };
const mockTaskItems = { list: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() };

vi.mock("googleapis", () => ({
  google: {
    people: vi.fn(() => ({
      people: {
        connections: mockConnections,
        createContact: mockConnections.create,
        updateContact: mockConnections.update,
        get: mockConnections.get,
      },
      otherContacts: { search: mockPeople.searchContacts },
    })),
    tasks: vi.fn(() => ({
      tasklists: mockTasksLists,
      tasks: mockTaskItems,
    })),
  },
}));

import {
  completeTask,
  createContact,
  createTask,
  createTaskList,
  deleteTask,
  deleteTaskList,
  listContacts,
  listTaskLists,
  listTasks,
  searchContacts,
  updateContact,
  updateTask,
  updateTaskList,
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
      expect.objectContaining({ personFields: "names,emailAddresses,phoneNumbers" }),
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
      expect.objectContaining({ query: "bob", readMask: "names,emailAddresses,phoneNumbers" }),
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

describe("updateContact", () => {
  it("fetches etag then updates name and email, setting updatePersonFields", async () => {
    mockConnections.get?.mockResolvedValue({ data: { resourceName: "people/3", etag: "abc" } });
    mockConnections.update.mockResolvedValue({ data: { resourceName: "people/3" } });
    await updateContact(client, {
      resourceName: "people/3",
      name: "Carol Renamed",
      email: "__VG_EMAIL_2a3a9bd93ab9__",
    });
    expect(mockConnections.get).toHaveBeenCalledWith({
      resourceName: "people/3",
      personFields: "names",
    });
    expect(mockConnections.update).toHaveBeenCalledWith({
      resourceName: "people/3",
      updatePersonFields: "names,emailAddresses",
      requestBody: {
        etag: "abc",
        names: [{ displayName: "Carol Renamed", givenName: "Carol Renamed" }],
        emailAddresses: [{ value: "__VG_EMAIL_2a3a9bd93ab9__" }],
      },
    });
  });

  it("uses a provided etag without fetching", async () => {
    mockConnections.update.mockResolvedValue({ data: { resourceName: "people/3" } });
    await updateContact(client, {
      resourceName: "people/3",
      phone: "+1-555-0100",
      etag: "etag-1",
    });
    expect(mockConnections.get).not.toHaveBeenCalled();
    expect(mockConnections.update).toHaveBeenCalledWith({
      resourceName: "people/3",
      updatePersonFields: "phoneNumbers",
      requestBody: { etag: "etag-1", phoneNumbers: [{ value: "+1-555-0100" }] },
    });
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
      data: {
        items: [
          { id: "t1", title: "Buy milk", status: "needsAction", due: "2026-08-10T00:00:00.000Z" },
        ],
      },
    });
    const result = await listTasks(client, { tasklistId: "tl1" });
    expect(mockTaskItems.list).toHaveBeenCalledWith({ tasklist: "tl1" });
    expect(result[0]).toMatchObject({ id: "t1", title: "Buy milk" });
  });

  it("passes due window filters to the API", async () => {
    mockTaskItems.list.mockResolvedValue({ data: { items: [] } });
    await listTasks(client, {
      tasklistId: "tl1",
      dueMin: "2026-08-01T00:00:00.000Z",
      dueMax: "2026-08-31T23:59:59.000Z",
    });
    expect(mockTaskItems.list).toHaveBeenCalledWith({
      tasklist: "tl1",
      dueMin: "2026-08-01T00:00:00.000Z",
      dueMax: "2026-08-31T23:59:59.000Z",
    });
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

  it("creates a subtask under a parent task", async () => {
    mockTaskItems.insert.mockResolvedValue({ data: { id: "t3", title: "Subtask", parent: "t2" } });
    const result = await createTask(client, {
      tasklistId: "tl1",
      title: "Subtask",
      parentTaskId: "t2",
    });
    expect(mockTaskItems.insert).toHaveBeenCalledWith({
      tasklist: "tl1",
      requestBody: { title: "Subtask", parent: "t2" },
    });
    expect(result.parent).toBe("t2");
  });
});

describe("updateTask", () => {
  it("patches title, notes, due, and status", async () => {
    mockTaskItems.patch.mockResolvedValue({
      data: {
        id: "t1",
        title: "Buy milk (2%), almond",
        status: "needsAction",
        due: "2026-08-12T00:00:00.000Z",
      },
    });
    const result = await updateTask(client, {
      tasklistId: "tl1",
      taskId: "t1",
      title: "Buy almond milk",
      notes: "2% at corner store",
      due: "2026-08-12T00:00:00.000Z",
      status: "needsAction",
    });
    expect(mockTaskItems.patch).toHaveBeenCalledWith({
      tasklist: "tl1",
      task: "t1",
      requestBody: {
        title: "Buy almond milk",
        notes: "2% at corner store",
        due: "2026-08-12T00:00:00.000Z",
        status: "needsAction",
      },
    });
    expect(result.title).toBe("Buy milk (2%), almond");
  });

  it("throws when nothing to update", async () => {
    await expect(updateTask(client, { tasklistId: "tl1", taskId: "t1" })).rejects.toThrow(
      "Nothing to update",
    );
    expect(mockTaskItems.patch).not.toHaveBeenCalled();
  });
});

describe("taskList CRUD", () => {
  it("creates a task list", async () => {
    mockTasksLists.insert.mockResolvedValue({ data: { id: "tl9", title: "Chores" } });
    const result = await createTaskList(client, { title: "Chores" });
    expect(mockTasksLists.insert).toHaveBeenCalledWith({ requestBody: { title: "Chores" } });
    expect(result).toEqual({ id: "tl9", title: "Chores" });
  });

  it("renames a task list", async () => {
    mockTasksLists.patch.mockResolvedValue({ data: { id: "tl9", title: "House chores" } });
    const result = await updateTaskList(client, { tasklistId: "tl9", title: "House chores" });
    expect(mockTasksLists.patch).toHaveBeenCalledWith({
      tasklist: "tl9",
      requestBody: { title: "House chores" },
    });
    expect(result.title).toBe("House chores");
  });

  it("deletes a task list", async () => {
    mockTasksLists.delete.mockResolvedValue({ data: {} });
    await deleteTaskList(client, { tasklistId: "tl9" });
    expect(mockTasksLists.delete).toHaveBeenCalledWith({ tasklist: "tl9" });
  });
});

describe("completeTask", () => {
  it("marks a task completed", async () => {
    mockTaskItems.patch.mockResolvedValue({
      data: { id: "t1", title: "Buy milk", status: "completed" },
    });
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

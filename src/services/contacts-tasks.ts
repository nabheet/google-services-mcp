import type { Auth } from "googleapis";
import { google } from "googleapis";

export interface ListContactsOptions {
  pageSize?: number;
}

export interface SearchContactsOptions {
  query: string;
  pageSize?: number;
}

export interface CreateContactOptions {
  name: string;
  email?: string;
  phone?: string;
}

export interface ListTasksOptions {
  tasklistId?: string;
}

export interface CreateTaskOptions {
  tasklistId?: string;
  title: string;
  notes?: string;
  due?: string;
}

export interface TaskRefOptions {
  tasklistId?: string;
  taskId: string;
}

export interface ContactSummary {
  resourceName: string;
  name?: string;
  emails: string[];
  phones: string[];
}

export interface TaskSummary {
  id: string;
  title?: string;
  status?: string;
  notes?: string;
  due?: string;
}

/** List the signed-in user's contacts. */
export async function listContacts(client: Auth.OAuth2Client, opts: ListContactsOptions): Promise<ContactSummary[]> {
  const people = google.people({ version: "v1", auth: client });
  const res = await people.people.connections.list({
    resourceName: "people/me",
    personFields: "names,emailAddresses,phoneNumbers",
    pageSize: opts.pageSize ?? 100,
  });
  return (res.data.connections ?? []).map((c) => ({
    resourceName: c.resourceName as string,
    name: c.names?.[0]?.displayName as string | undefined,
    emails: (c.emailAddresses ?? []).map((e) => e.value as string),
    phones: (c.phoneNumbers ?? []).map((p) => p.value as string),
  }));
}

/** Search all contacts (including not-connected ones) by name/email/phone. */
export async function searchContacts(client: Auth.OAuth2Client, opts: SearchContactsOptions): Promise<ContactSummary[]> {
  const people = google.people({ version: "v1", auth: client });
  const res = await people.otherContacts.search({
    query: opts.query,
    readMask: "names,emailAddresses,phoneNumbers",
    pageSize: opts.pageSize ?? 25,
  });
  return (res.data.results ?? []).map((r) => {
    const c = r.person ?? {};
    return {
      resourceName: (c.resourceName ?? "") as string,
      name: c.names?.[0]?.displayName as string | undefined,
      emails: (c.emailAddresses ?? []).map((e) => e.value as string),
      phones: (c.phoneNumbers ?? []).map((p) => p.value as string),
    };
  });
}

/** Create a new contact. */
export async function createContact(client: Auth.OAuth2Client, opts: CreateContactOptions): Promise<{ resourceName: string }> {
  const people = google.people({ version: "v1", auth: client });
  const requestBody: any = {
    names: [{ displayName: opts.name, givenName: opts.name }],
  };
  if (opts.email) requestBody.emailAddresses = [{ value: opts.email }];
  if (opts.phone) requestBody.phoneNumbers = [{ value: opts.phone }];
  const res = await people.people.createContact({
    requestBody,
    personFields: "names,emailAddresses,phoneNumbers",
  });
  return { resourceName: res.data.resourceName ?? "" };
}

/** List the user's task lists. */
export async function listTaskLists(client: Auth.OAuth2Client): Promise<Array<{ id: string; title?: string }>> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const res = await tasks.tasklists.list();
  return (res.data.items ?? []).map((l) => ({ id: l.id as string, title: l.title as string | undefined }));
}

/** List tasks in a task list. */
export async function listTasks(client: Auth.OAuth2Client, opts: ListTasksOptions): Promise<TaskSummary[]> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const res = await tasks.tasks.list({ tasklist: opts.tasklistId ?? "@default" });
  return (res.data.items ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string | undefined,
    status: t.status as string | undefined,
    notes: t.notes as string | undefined,
    due: t.due as string | undefined,
  }));
}

/** Create a task. */
export async function createTask(client: Auth.OAuth2Client, opts: CreateTaskOptions): Promise<TaskSummary> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const requestBody: any = { title: opts.title };
  if (opts.notes) requestBody.notes = opts.notes;
  if (opts.due) requestBody.due = opts.due;
  const res = await tasks.tasks.insert({ tasklist: opts.tasklistId ?? "@default", requestBody });
  return {
    id: res.data.id as string,
    title: res.data.title as string | undefined,
    status: res.data.status as string | undefined,
  };
}

/** Mark a task as completed. */
export async function completeTask(client: Auth.OAuth2Client, opts: TaskRefOptions): Promise<TaskSummary> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const res = await tasks.tasks.patch({
    tasklist: opts.tasklistId ?? "@default",
    task: opts.taskId,
    requestBody: { status: "completed" },
  });
  return {
    id: res.data.id as string,
    title: res.data.title as string | undefined,
    status: res.data.status as string | undefined,
  };
}

/** Delete a task. */
export async function deleteTask(client: Auth.OAuth2Client, opts: TaskRefOptions): Promise<void> {
  const tasks = google.tasks({ version: "v1", auth: client });
  await tasks.tasks.delete({ tasklist: opts.tasklistId ?? "@default", task: opts.taskId });
}

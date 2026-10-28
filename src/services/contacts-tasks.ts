import type { Auth, people_v1, tasks_v1 } from "googleapis";
import { google } from "googleapis";
import type { ListPage } from "../util/pagination.js";

export interface ListContactsOptions {
  pageSize?: number;
  /** Token from a previous page's `nextPageToken`. */
  pageToken?: string;
}

export interface SearchContactsOptions {
  query: string;
  pageSize?: number;
}

export interface CreateContactOptions {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  organization?: string;
  /** Base64-encoded photo bytes (JPEG/PNG). */
  photoBytes?: string;
}

export interface UpdateContactOptions {
  resourceName: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  organization?: string;
  /** Base64-encoded photo bytes (JPEG/PNG). */
  photoBytes?: string;
  /** Contact etag for optimistic concurrency. Fetched automatically if omitted. */
  etag?: string;
}

export interface GetContactOptions {
  resourceName: string;
}

export interface ContactRefOptions {
  resourceName: string;
}

export interface ListTasksOptions {
  tasklistId?: string;
  /** Only tasks due at or after this RFC3339 datetime. */
  dueMin?: string;
  /** Only tasks due at or before this RFC3339 datetime. */
  dueMax?: string;
  /** Token from a previous page's `nextPageToken`. */
  pageToken?: string;
}

export interface ListTaskListsOptions {
  /** Token from a previous page's `nextPageToken`. */
  pageToken?: string;
}

export interface CreateTaskOptions {
  tasklistId?: string;
  title: string;
  notes?: string;
  due?: string;
  /** Parent task ID for subtasks. */
  parentTaskId?: string;
}

export interface UpdateTaskOptions {
  tasklistId?: string;
  taskId: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
}

export interface TaskListOptions {
  tasklistId: string;
}

export interface CreateTaskListOptions {
  title: string;
}

export interface UpdateTaskListOptions {
  tasklistId: string;
  title: string;
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
  parent?: string;
}

/** List the signed-in user's contacts. */
export async function listContacts(
  client: Auth.OAuth2Client,
  opts: ListContactsOptions,
): Promise<ListPage<ContactSummary>> {
  const people = google.people({ version: "v1", auth: client });
  const res = await people.people.connections.list({
    resourceName: "people/me",
    personFields: "names,emailAddresses,phoneNumbers",
    pageSize: opts.pageSize ?? 100,
    ...(opts.pageToken !== undefined ? { pageToken: opts.pageToken } : {}),
  });
  return {
    items: (res.data.connections ?? []).map((c) => ({
      resourceName: c.resourceName as string,
      name: c.names?.[0]?.displayName as string | undefined,
      emails: (c.emailAddresses ?? []).map((e) => e.value as string),
      phones: (c.phoneNumbers ?? []).map((p) => p.value as string),
    })),
    ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
  };
}

/** Search all contacts (including not-connected ones) by name/email/phone. */
export async function searchContacts(
  client: Auth.OAuth2Client,
  opts: SearchContactsOptions,
): Promise<ContactSummary[]> {
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
export async function createContact(
  client: Auth.OAuth2Client,
  opts: CreateContactOptions,
): Promise<{ resourceName: string }> {
  const people = google.people({ version: "v1", auth: client });
  const requestBody: people_v1.Schema$Person = {
    names: [{ displayName: opts.name, givenName: opts.name }],
  };
  if (opts.email) requestBody.emailAddresses = [{ value: opts.email }];
  if (opts.phone) requestBody.phoneNumbers = [{ value: opts.phone }];
  if (opts.address) requestBody.addresses = [{ formattedValue: opts.address }];
  if (opts.organization) requestBody.organizations = [{ name: opts.organization }];
  const res = await people.people.createContact({
    requestBody,
    personFields: "names,emailAddresses,phoneNumbers,addresses,organizations",
  });
  const resourceName = res.data.resourceName ?? "";
  if (opts.photoBytes && resourceName) {
    await people.people.updateContactPhoto({
      resourceName,
      requestBody: { photoBytes: opts.photoBytes },
    });
  }
  return { resourceName };
}

/** Get a contact by resourceName (rich fields: name, email, phone, address, org). */
export async function getContact(
  client: Auth.OAuth2Client,
  opts: GetContactOptions,
): Promise<people_v1.Schema$Person> {
  const people = google.people({ version: "v1", auth: client });
  const res = await people.people.get({
    resourceName: opts.resourceName,
    personFields: "names,emailAddresses,phoneNumbers,addresses,organizations",
  });
  return res.data;
}

/** Delete a contact by resourceName. */
export async function deleteContact(
  client: Auth.OAuth2Client,
  opts: ContactRefOptions,
): Promise<{ deleted: true; resourceName: string }> {
  const people = google.people({ version: "v1", auth: client });
  await people.people.deleteContact({ resourceName: opts.resourceName });
  return { deleted: true, resourceName: opts.resourceName };
}

/** Replace the primary value of a multi-valued field, keeping the others. */
function mergePrimary<T>(existing: T[] | null | undefined, update: T): T[] {
  const values = [...(existing ?? [])];
  if (values.length === 0) return [update];
  values[0] = { ...values[0], ...update };
  return values;
}

const CONTACT_FIELDS = "names,emailAddresses,phoneNumbers,addresses,organizations";

/** Update an existing contact (name, email, phone, address, organization, photo).
 *  Multi-valued fields keep their other entries: the People API replaces the
 *  whole field named in `updatePersonFields`, so only the primary value is
 *  changed and the rest are sent back untouched. */
export async function updateContact(
  client: Auth.OAuth2Client,
  opts: UpdateContactOptions,
): Promise<{ resourceName: string }> {
  const people = google.people({ version: "v1", auth: client });
  const requestBody: people_v1.Schema$Person = {};
  const updatePersonFields: string[] = [];
  const hasFields =
    opts.name !== undefined ||
    opts.email !== undefined ||
    opts.phone !== undefined ||
    opts.address !== undefined ||
    opts.organization !== undefined;

  if (!hasFields && !opts.photoBytes) {
    throw new Error(
      "Nothing to update: provide at least one of name, email, phone, address, or organization.",
    );
  }

  if (hasFields) {
    // Merging needs the current values, and the People API requires the person
    // etag on update (optimistic concurrency): one read serves both.
    const current = await people.people.get({
      resourceName: opts.resourceName,
      personFields: CONTACT_FIELDS,
    });
    requestBody.etag = opts.etag ?? current.data.etag ?? undefined;

    if (opts.name !== undefined) {
      const existingName = current.data.names?.[0];
      const name: people_v1.Schema$Name = existingName
        ? { ...existingName, displayName: opts.name }
        : { displayName: opts.name, givenName: opts.name };
      // A contact with no family name is a mononym; keep givenName usable.
      if (existingName !== undefined && existingName.familyName == null) {
        name.givenName = opts.name;
      }
      requestBody.names = mergePrimary(current.data.names, name);
      updatePersonFields.push("names");
    }
    if (opts.email !== undefined) {
      requestBody.emailAddresses = mergePrimary(current.data.emailAddresses, {
        value: opts.email,
      });
      updatePersonFields.push("emailAddresses");
    }
    if (opts.phone !== undefined) {
      requestBody.phoneNumbers = mergePrimary(current.data.phoneNumbers, { value: opts.phone });
      updatePersonFields.push("phoneNumbers");
    }
    if (opts.address !== undefined) {
      requestBody.addresses = mergePrimary(current.data.addresses, {
        formattedValue: opts.address,
      });
      updatePersonFields.push("addresses");
    }
    if (opts.organization !== undefined) {
      requestBody.organizations = mergePrimary(current.data.organizations, {
        name: opts.organization,
      });
      updatePersonFields.push("organizations");
    }
  }

  let resourceName = opts.resourceName;
  if (updatePersonFields.length > 0) {
    const res = await people.people.updateContact({
      resourceName: opts.resourceName,
      updatePersonFields: updatePersonFields.join(","),
      requestBody,
    });
    resourceName = res.data.resourceName ?? opts.resourceName;
  }
  if (opts.photoBytes && resourceName) {
    await people.people.updateContactPhoto({
      resourceName,
      requestBody: { photoBytes: opts.photoBytes },
    });
  }
  return { resourceName };
}

/** List the user's task lists. */
export async function listTaskLists(
  client: Auth.OAuth2Client,
  opts: ListTaskListsOptions = {},
): Promise<ListPage<{ id: string; title?: string }>> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const res = await tasks.tasklists.list({
    ...(opts.pageToken !== undefined ? { pageToken: opts.pageToken } : {}),
  });
  return {
    items: (res.data.items ?? []).map((l) => ({
      id: l.id as string,
      title: l.title as string | undefined,
    })),
    ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
  };
}

/** List tasks in a task list. */
export async function listTasks(
  client: Auth.OAuth2Client,
  opts: ListTasksOptions,
): Promise<ListPage<TaskSummary>> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const params: Record<string, string> = { tasklist: opts.tasklistId ?? "@default" };
  if (opts.dueMin !== undefined) params.dueMin = opts.dueMin;
  if (opts.dueMax !== undefined) params.dueMax = opts.dueMax;
  if (opts.pageToken !== undefined) params.pageToken = opts.pageToken;
  const res = await tasks.tasks.list(params);
  return {
    items: (res.data.items ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string | undefined,
      status: t.status as string | undefined,
      notes: t.notes as string | undefined,
      due: t.due as string | undefined,
      parent: t.parent as string | undefined,
    })),
    ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
  };
}

/** Create a task (optionally a subtask via parentTaskId). */
export async function createTask(
  client: Auth.OAuth2Client,
  opts: CreateTaskOptions,
): Promise<TaskSummary> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const requestBody: tasks_v1.Schema$Task = { title: opts.title };
  if (opts.notes) requestBody.notes = opts.notes;
  if (opts.due) requestBody.due = opts.due;
  // `parent` is a query parameter on tasks.insert; Schema$Task.parent is
  // output-only, so putting it in the body creates a top-level task.
  const params: tasks_v1.Params$Resource$Tasks$Insert = {
    tasklist: opts.tasklistId ?? "@default",
    requestBody,
  };
  if (opts.parentTaskId) params.parent = opts.parentTaskId;
  const res = await tasks.tasks.insert(params);
  return {
    id: res.data.id as string,
    title: res.data.title as string | undefined,
    status: res.data.status as string | undefined,
    parent: res.data.parent as string | undefined,
  };
}

/** Update a task (title, notes, due, status). */
export async function updateTask(
  client: Auth.OAuth2Client,
  opts: UpdateTaskOptions,
): Promise<TaskSummary> {
  const requestBody: tasks_v1.Schema$Task = {};
  if (opts.title !== undefined) requestBody.title = opts.title;
  if (opts.notes !== undefined) requestBody.notes = opts.notes;
  if (opts.due !== undefined) requestBody.due = opts.due;
  if (opts.status !== undefined) requestBody.status = opts.status;
  if (Object.keys(requestBody).length === 0) {
    throw new Error("Nothing to update: provide at least one of title, notes, due, or status.");
  }
  const tasks = google.tasks({ version: "v1", auth: client });
  const res = await tasks.tasks.patch({
    tasklist: opts.tasklistId ?? "@default",
    task: opts.taskId,
    requestBody,
  });
  return {
    id: res.data.id as string,
    title: res.data.title as string | undefined,
    status: res.data.status as string | undefined,
  };
}

/** Create a task list. */
export async function createTaskList(
  client: Auth.OAuth2Client,
  opts: CreateTaskListOptions,
): Promise<{ id: string; title?: string }> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const res = await tasks.tasklists.insert({ requestBody: { title: opts.title } });
  return { id: res.data.id as string, title: res.data.title as string | undefined };
}

/** Rename a task list. */
export async function updateTaskList(
  client: Auth.OAuth2Client,
  opts: UpdateTaskListOptions,
): Promise<{ id: string; title?: string }> {
  const tasks = google.tasks({ version: "v1", auth: client });
  const res = await tasks.tasklists.patch({
    tasklist: opts.tasklistId,
    requestBody: { title: opts.title },
  });
  return { id: res.data.id as string, title: res.data.title as string | undefined };
}

/** Delete a task list. */
export async function deleteTaskList(
  client: Auth.OAuth2Client,
  opts: TaskListOptions,
): Promise<void> {
  const tasks = google.tasks({ version: "v1", auth: client });
  await tasks.tasklists.delete({ tasklist: opts.tasklistId });
}

/** Mark a task as completed. */
export async function completeTask(
  client: Auth.OAuth2Client,
  opts: TaskRefOptions,
): Promise<TaskSummary> {
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

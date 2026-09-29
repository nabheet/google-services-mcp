import type { Auth, calendar_v3 } from "googleapis";
import { google } from "googleapis";

export interface ListEventsOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
}

export type SendUpdates = "all" | "externalOnly" | "none";
export type EventTransparency = "opaque" | "transparent";
export type ReminderMethod = "email" | "popup";

export interface CreateEventOptions {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  /** RFC3339 datetime, or a plain date (YYYY-MM-DD) for all-day events. */
  start: string;
  /** RFC3339 datetime, or a plain date (YYYY-MM-DD, exclusive) for all-day events. */
  end: string;
  /** IANA time zone, e.g. "America/Denver". Required for recurring timed events. */
  timeZone?: string;
  attendees?: string[];
  /** RRULE strings, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TH"]. */
  recurrence?: string[];
  reminderMethod?: ReminderMethod;
  reminderMinutes?: number;
  remindersUseDefault?: boolean;
  /** Control whether attendee emails are sent. */
  sendUpdates?: SendUpdates;
  transparency?: EventTransparency;
  colorId?: string;
}

export interface UpdateEventOptions {
  calendarId?: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  /** IANA time zone, e.g. "America/Denver". Required when updating to recurring timed events. */
  timeZone?: string;
  attendees?: string[];
  recurrence?: string[];
  reminderMethod?: ReminderMethod;
  reminderMinutes?: number;
  remindersUseDefault?: boolean;
  sendUpdates?: SendUpdates;
  transparency?: EventTransparency;
  colorId?: string;
}

export interface GetEventOptions {
  calendarId?: string;
  eventId: string;
}

export interface FreeBusyOptions {
  /** Start of range (RFC3339). */
  timeMin: string;
  /** End of range (RFC3339). */
  timeMax: string;
  /** Calendar IDs to query (default primary). */
  items?: string[];
  /** IANA time zone, e.g. America/Los_Angeles. */
  timeZone?: string;
}

export interface FreeBusyInterval {
  start: string;
  end: string;
}

export interface FreeBusyResult {
  timeMin?: string;
  timeMax?: string;
  calendars: Record<string, { busy: FreeBusyInterval[] }>;
}

export type ResponseStatus = "accepted" | "declined" | "tentative";

export interface RespondEventOptions extends GetEventOptions {
  /** Attendee email whose responseStatus should be set (the signed-in user). */
  email: string;
  responseStatus: ResponseStatus;
  /** Notify the organizer: "all", "externalOnly", or "none". */
  sendUpdates?: "all" | "externalOnly" | "none";
}

export interface DeleteEventOptions extends GetEventOptions {}

export interface CalendarSummary {
  id: string;
  summary?: string;
  isPrimary?: boolean;
  accessRole?: string;
}

export interface CreateCalendarOptions {
  summary: string;
  timeZone?: string;
  description?: string;
}

export interface UpdateCalendarOptions {
  calendarId: string;
  summary?: string;
  colorId?: string;
  timeZone?: string;
  description?: string;
}

export interface DeleteCalendarOptions {
  calendarId: string;
}

export interface EventSummary {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  hangoutLink?: string;
  htmlLink?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  recurrence?: string[];
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method?: string; minutes?: number }>;
  };
  transparency?: string;
  colorId?: string;
}

function isAllDay(dt: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dt);
}

function buildStartEnd(start: string, end: string, timeZone?: string) {
  if (isAllDay(start) || isAllDay(end)) {
    return { start: { date: start }, end: { date: end } };
  }
  return {
    start: { dateTime: start, ...(timeZone !== undefined ? { timeZone } : {}) },
    end: { dateTime: end, ...(timeZone !== undefined ? { timeZone } : {}) },
  };
}

/** Recurring timed events require an explicit time zone (Google API error otherwise). */
function assertRecurringTimeZone(
  recurrence: string[] | undefined,
  start: string | undefined,
  end: string | undefined,
  timeZone: string | undefined,
) {
  if (
    recurrence !== undefined &&
    recurrence.length > 0 &&
    start !== undefined &&
    end !== undefined &&
    !isAllDay(start) &&
    !isAllDay(end) &&
    timeZone === undefined
  ) {
    throw new Error('Recurring timed events require a timeZone (e.g. "America/Denver").');
  }
}

/** Build the reminders sub-object from reminder option fields, or undefined. */
function buildReminders(opts: {
  reminderMethod?: ReminderMethod;
  reminderMinutes?: number;
  remindersUseDefault?: boolean;
}): calendar_v3.Schema$Event["reminders"] | undefined {
  if (opts.remindersUseDefault === true) {
    return { useDefault: true };
  }
  if (opts.reminderMethod !== undefined || opts.reminderMinutes !== undefined) {
    return {
      useDefault: false,
      overrides: [
        {
          method: opts.reminderMethod ?? "popup",
          minutes: opts.reminderMinutes ?? 10,
        },
      ],
    };
  }
  return undefined;
}

/** List the user's calendars. */
export async function listCalendars(client: Auth.OAuth2Client): Promise<CalendarSummary[]> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.calendarList.list();
  return (res.data.items ?? []).map((c) => ({
    id: c.id as string,
    summary: c.summary as string | undefined,
    isPrimary: !!c.primary,
    accessRole: c.accessRole as string | undefined,
  }));
}

/** Create a secondary calendar. Returns the created calendar metadata. */
export async function createCalendar(
  client: Auth.OAuth2Client,
  opts: CreateCalendarOptions,
): Promise<CalendarSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const requestBody: calendar_v3.Schema$Calendar = {
    summary: opts.summary,
  };
  if (opts.timeZone !== undefined) requestBody.timeZone = opts.timeZone;
  if (opts.description !== undefined) requestBody.description = opts.description;
  const res = await calendar.calendars.insert({ requestBody });
  return {
    id: res.data.id as string,
    summary: res.data.summary as string | undefined,
  };
}

/** Update a calendar's metadata (partial: summary, colorId, timeZone, description).
 *  summary/timeZone/description go through calendars.patch (calendar-level);
 *  colorId goes through calendarList.patch (per-user view). */
export async function updateCalendar(
  client: Auth.OAuth2Client,
  opts: UpdateCalendarOptions,
): Promise<CalendarSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  let result: calendar_v3.Schema$Calendar | undefined;

  const metaBody: calendar_v3.Schema$Calendar = {};
  if (opts.summary !== undefined) metaBody.summary = opts.summary;
  if (opts.timeZone !== undefined) metaBody.timeZone = opts.timeZone;
  if (opts.description !== undefined) metaBody.description = opts.description;
  if (Object.keys(metaBody).length > 0) {
    const res = await calendar.calendars.patch({
      calendarId: opts.calendarId,
      requestBody: metaBody,
    });
    result = res.data;
  }

  if (opts.colorId !== undefined) {
    await calendar.calendarList.patch({
      calendarId: opts.calendarId,
      requestBody: { colorId: opts.colorId },
    });
  }

  return {
    id: (result?.id ?? opts.calendarId) as string,
    summary: result?.summary as string | undefined,
  };
}

/** Delete a calendar permanently (destructive). */
export async function deleteCalendar(
  client: Auth.OAuth2Client,
  opts: DeleteCalendarOptions,
): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth: client });
  await calendar.calendars.delete({ calendarId: opts.calendarId });
}

/** List events in a calendar, optionally filtered by time range / free-text query. */
export async function listEvents(
  client: Auth.OAuth2Client,
  opts: ListEventsOptions,
): Promise<EventSummary[]> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.events.list({
    calendarId: opts.calendarId ?? "primary",
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
    maxResults: opts.maxResults ?? 25,
    q: opts.q,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (res.data.items ?? []).map((e) => ({
    id: e.id as string,
    summary: e.summary as string | undefined,
    description: e.description as string | undefined,
    location: e.location as string | undefined,
    start: e.start as EventSummary["start"],
    end: e.end as EventSummary["end"],
    hangoutLink: e.hangoutLink as string | undefined,
    htmlLink: e.htmlLink as string | undefined,
  }));
}

/** Create an event. Returns the created event. */
export async function createEvent(
  client: Auth.OAuth2Client,
  opts: CreateEventOptions,
): Promise<EventSummary> {
  const startMs = Date.parse(opts.start.replace(" ", "T"));
  const endMs = Date.parse(opts.end.replace(" ", "T"));
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs <= startMs) {
    throw new Error("Event end must not be before start.");
  }
  assertRecurringTimeZone(opts.recurrence, opts.start, opts.end, opts.timeZone);
  const calendar = google.calendar({ version: "v3", auth: client });
  const requestBody: calendar_v3.Schema$Event = {
    summary: opts.summary,
    description: opts.description,
    location: opts.location,
    ...buildStartEnd(opts.start, opts.end, opts.timeZone),
    attendees: opts.attendees?.map((email) => ({ email })),
    ...(opts.recurrence !== undefined ? { recurrence: opts.recurrence } : {}),
    ...(buildReminders(opts) !== undefined ? { reminders: buildReminders(opts) } : {}),
    ...(opts.transparency !== undefined ? { transparency: opts.transparency } : {}),
    ...(opts.colorId !== undefined ? { colorId: opts.colorId } : {}),
  };
  const res = await calendar.events.insert({
    calendarId: opts.calendarId ?? "primary",
    ...(opts.sendUpdates !== undefined ? { sendUpdates: opts.sendUpdates } : {}),
    requestBody,
  });
  return mapEvent(res.data);
}

/** Query busy intervals across calendars (free/busy). */
export async function queryFreeBusy(
  client: Auth.OAuth2Client,
  opts: FreeBusyOptions,
): Promise<FreeBusyResult> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      items: (opts.items ?? ["primary"]).map((id) => ({ id })),
      ...(opts.timeZone !== undefined ? { timeZone: opts.timeZone } : {}),
    },
  });
  const calendars: FreeBusyResult["calendars"] = {};
  for (const [id, info] of Object.entries(res.data.calendars ?? {})) {
    calendars[id] = {
      busy: (info.busy ?? []).map((b) => ({ start: b.start ?? "", end: b.end ?? "" })),
    };
  }
  return {
    timeMin: res.data.timeMin as string | undefined,
    timeMax: res.data.timeMax as string | undefined,
    calendars,
  };
}

/** Get a single event. */
export async function getEvent(
  client: Auth.OAuth2Client,
  opts: GetEventOptions,
): Promise<EventSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.events.get({
    calendarId: opts.calendarId ?? "primary",
    eventId: opts.eventId,
  });
  return mapEvent(res.data);
}

/** Update an existing event (partial). */
export async function updateEvent(
  client: Auth.OAuth2Client,
  opts: UpdateEventOptions,
): Promise<EventSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const requestBody: calendar_v3.Schema$Event = {};
  if (opts.summary !== undefined) requestBody.summary = opts.summary;
  if (opts.description !== undefined) requestBody.description = opts.description;
  if (opts.location !== undefined) requestBody.location = opts.location;
  if (opts.attendees !== undefined)
    requestBody.attendees = opts.attendees.map((email) => ({ email }));
  if (opts.start !== undefined && opts.end !== undefined) {
    assertRecurringTimeZone(opts.recurrence, opts.start, opts.end, opts.timeZone);
    Object.assign(requestBody, buildStartEnd(opts.start, opts.end, opts.timeZone));
  }
  if (opts.recurrence !== undefined) requestBody.recurrence = opts.recurrence;
  const reminders = buildReminders(opts);
  if (reminders !== undefined) requestBody.reminders = reminders;
  if (opts.transparency !== undefined) requestBody.transparency = opts.transparency;
  if (opts.colorId !== undefined) requestBody.colorId = opts.colorId;
  const res = await calendar.events.patch({
    calendarId: opts.calendarId ?? "primary",
    eventId: opts.eventId,
    ...(opts.sendUpdates !== undefined ? { sendUpdates: opts.sendUpdates } : {}),
    requestBody,
  });
  return mapEvent(res.data);
}

/** Delete an event. */
export async function deleteEvent(
  client: Auth.OAuth2Client,
  opts: DeleteEventOptions,
): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth: client });
  await calendar.events.delete({
    calendarId: opts.calendarId ?? "primary",
    eventId: opts.eventId,
  });
}

/**
 * Respond to an event invite by setting the attendee's responseStatus.
 * Fetches the event first so only the matching attendee is patched; the rest
 * of the attendee list is preserved.
 */
export async function respondToEvent(
  client: Auth.OAuth2Client,
  opts: RespondEventOptions,
): Promise<EventSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const calendarId = opts.calendarId ?? "primary";
  const current = await calendar.events.get({ calendarId, eventId: opts.eventId });
  const attendees: calendar_v3.Schema$EventAttendee[] = (current.data.attendees ?? []).map((a) =>
    a.email === opts.email ? { ...a, responseStatus: opts.responseStatus } : a,
  );
  if (!attendees.some((a) => a.email === opts.email)) {
    attendees.push({ email: opts.email, responseStatus: opts.responseStatus });
  }
  const res = await calendar.events.patch({
    calendarId,
    eventId: opts.eventId,
    requestBody: { attendees },
    ...(opts.sendUpdates ? { sendUpdates: opts.sendUpdates } : {}),
  });
  return mapEvent(res.data);
}

/** Create an event with an attached Google Meet conference. Returns the hangout link. */
export async function createMeetLink(
  client: Auth.OAuth2Client,
  opts: CreateEventOptions,
): Promise<EventSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const requestBody: calendar_v3.Schema$Event = {
    summary: opts.summary,
    description: opts.description,
    location: opts.location,
    ...buildStartEnd(opts.start, opts.end),
    attendees: opts.attendees?.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `gmcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const res = await calendar.events.insert({
    calendarId: opts.calendarId ?? "primary",
    requestBody,
    conferenceDataVersion: 1,
  });
  return mapEvent(res.data);
}

function mapEvent(data: calendar_v3.Schema$Event): EventSummary {
  return {
    id: data.id as string,
    summary: data.summary as string | undefined,
    description: data.description as string | undefined,
    location: data.location as string | undefined,
    start: data.start as EventSummary["start"],
    end: data.end as EventSummary["end"],
    hangoutLink: data.hangoutLink as string | undefined,
    htmlLink: data.htmlLink as string | undefined,
    attendees: data.attendees as EventSummary["attendees"],
    recurrence: data.recurrence as string[] | undefined,
    reminders: data.reminders as EventSummary["reminders"],
    transparency: data.transparency as string | undefined,
    colorId: data.colorId as string | undefined,
  };
}

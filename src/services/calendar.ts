import type { Auth, calendar_v3 } from "googleapis";
import { google } from "googleapis";
import type { ListPage } from "../util/pagination.js";

export interface ListEventsOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
  /** Token from a previous page's `nextPageToken`. */
  pageToken?: string;
}

export interface ListCalendarsOptions {
  /** Token from a previous page's `nextPageToken`. */
  pageToken?: string;
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
  /** Per calendar; `errors` is present when the calendar could not be read. */
  calendars: Record<string, { busy: FreeBusyInterval[]; errors?: string[] }>;
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
  /** Set on an instance of a recurring series: the series' event id. */
  recurringEventId?: string;
  /** Set on an instance: when this occurrence was scheduled to start. */
  originalStartTime?: { dateTime?: string; date?: string; timeZone?: string };
  /** "confirmed", "tentative" or "cancelled". */
  status?: string;
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

const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/;

/** Move an RFC3339 datetime by `deltaMs`, keeping the offset the caller used. */
function shiftDateTime(dt: string, deltaMs: number): string {
  const target = Date.parse(dt) + deltaMs;
  const offset = OFFSET_SUFFIX.exec(dt)?.[0];
  if (offset === undefined || offset === "Z") return new Date(target).toISOString();
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number) as [number, number];
  const local = new Date(target + sign * (hours * 60 + minutes) * 60_000)
    .toISOString()
    .slice(0, 19);
  return `${local}${offset}`;
}

/** Move an all-day date by `deltaMs`, counting whole days. */
function shiftDate(date: string, deltaMs: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + deltaMs).toISOString().slice(0, 10);
}

function storedBound(value: calendar_v3.Schema$EventDateTime | undefined): string | undefined {
  return value?.dateTime ?? value?.date ?? undefined;
}

/**
 * Resolve both ends of an update's time range. A lone `start` or `end` is
 * filled in from the stored event, keeping the existing duration, because the
 * update schema marks both sides optional and a one-sided patch would
 * otherwise be dropped silently.
 */
async function resolveTimeRange(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  opts: UpdateEventOptions,
): Promise<{ start: string; end: string } | undefined> {
  if (opts.start !== undefined && opts.end !== undefined) {
    return { start: opts.start, end: opts.end };
  }
  if (opts.start === undefined && opts.end === undefined) return undefined;

  const current = await calendar.events.get({ calendarId, eventId: opts.eventId });
  const storedStart = storedBound(current.data.start);
  const storedEnd = storedBound(current.data.end);
  if (storedStart === undefined || storedEnd === undefined) {
    throw new Error(
      "Cannot change only one side of the time range: the existing event has no time range. Pass both start and end.",
    );
  }

  const given = (opts.start ?? opts.end) as string;
  if (isAllDay(given) !== isAllDay(storedStart) || isAllDay(given) !== isAllDay(storedEnd)) {
    throw new Error(
      "Cannot mix an all-day date with a timed event in one update. Pass both start and end to convert the event.",
    );
  }

  const duration = Date.parse(storedEnd) - Date.parse(storedStart);
  if (!(duration > 0)) {
    throw new Error(
      "Cannot change only one side of the time range: the existing event ends before it starts. Pass both start and end.",
    );
  }

  const allDay = isAllDay(given);
  const shift = allDay
    ? (value: string, delta: number) => shiftDate(value, delta)
    : (value: string, delta: number) => shiftDateTime(value, delta);

  if (opts.start !== undefined) {
    return { start: opts.start, end: shift(opts.start, duration) };
  }
  const end = opts.end as string;
  return { start: shift(end, -duration), end };
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
export async function listCalendars(
  client: Auth.OAuth2Client,
  opts: ListCalendarsOptions = {},
): Promise<ListPage<CalendarSummary>> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.calendarList.list({
    ...(opts.pageToken !== undefined ? { pageToken: opts.pageToken } : {}),
  });
  return {
    items: (res.data.items ?? []).map((c) => ({
      id: c.id as string,
      summary: c.summary as string | undefined,
      isPrimary: !!c.primary,
      accessRole: c.accessRole as string | undefined,
    })),
    ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
  };
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
): Promise<ListPage<EventSummary>> {
  const calendar = google.calendar({ version: "v3", auth: client });
  // Without timeMin the API returns the oldest events first, which is the
  // opposite of "upcoming": the first page would be years of history.
  const timeMin = opts.timeMin ?? new Date().toISOString();
  const res = await calendar.events.list({
    calendarId: opts.calendarId ?? "primary",
    timeMin,
    timeMax: opts.timeMax,
    maxResults: opts.maxResults ?? 25,
    q: opts.q,
    singleEvents: true,
    orderBy: "startTime",
    ...(opts.pageToken !== undefined ? { pageToken: opts.pageToken } : {}),
  });
  return {
    items: (res.data.items ?? []).map(mapEvent),
    ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
  };
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
    const errors = (info.errors ?? []).map((e) => e.reason ?? "unknownError");
    calendars[id] = {
      busy: (info.busy ?? []).map((b) => ({ start: b.start ?? "", end: b.end ?? "" })),
      ...(errors.length > 0 ? { errors } : {}),
    };
  }
  // A requested calendar absent from the response is a failure, not a free one.
  for (const id of opts.items ?? ["primary"]) {
    calendars[id] ??= { busy: [], errors: ["calendar missing from the free/busy response"] };
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
  const range = await resolveTimeRange(calendar, opts.calendarId ?? "primary", opts);
  if (range !== undefined) {
    if (Date.parse(range.end) <= Date.parse(range.start)) {
      throw new Error("Event end must not be before start.");
    }
    assertRecurringTimeZone(opts.recurrence, range.start, range.end, opts.timeZone);
    Object.assign(requestBody, buildStartEnd(range.start, range.end, opts.timeZone));
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
  const wanted = opts.email.toLowerCase();
  const attendees: calendar_v3.Schema$EventAttendee[] = (current.data.attendees ?? []).map((a) =>
    a.email?.toLowerCase() === wanted ? { ...a, responseStatus: opts.responseStatus } : a,
  );
  if (!attendees.some((a) => a.email?.toLowerCase() === wanted)) {
    // Adding the address would invent an invite and notify the organizer about
    // a guest who was never invited. Say so instead.
    const known = (current.data.attendees ?? [])
      .map((a) => a.email)
      .filter((email): email is string => Boolean(email))
      .join(", ");
    throw new Error(
      `${opts.email} is not an attendee of event ${opts.eventId}` +
        (known.length > 0 ? `; attendees are: ${known}.` : "; the event has no attendees."),
    );
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
    recurringEventId: data.recurringEventId as string | undefined,
    originalStartTime: data.originalStartTime as EventSummary["originalStartTime"],
    status: data.status as string | undefined,
    reminders: data.reminders as EventSummary["reminders"],
    transparency: data.transparency as string | undefined,
    colorId: data.colorId as string | undefined,
  };
}

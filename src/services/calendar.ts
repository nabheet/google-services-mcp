import type { Auth } from "googleapis";
import { google } from "googleapis";

export interface ListEventsOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
}

export interface CreateEventOptions {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  /** RFC3339 datetime, or a plain date (YYYY-MM-DD) for all-day events. */
  start: string;
  /** RFC3339 datetime, or a plain date (YYYY-MM-DD, exclusive) for all-day events. */
  end: string;
  attendees?: string[];
}

export interface UpdateEventOptions {
  calendarId?: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  attendees?: string[];
}

export interface GetEventOptions {
  calendarId?: string;
  eventId: string;
}

export interface DeleteEventOptions extends GetEventOptions {}

export interface CalendarSummary {
  id: string;
  summary?: string;
  isPrimary?: boolean;
  accessRole?: string;
}

export interface EventSummary {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  htmlLink?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
}

function isAllDay(dt: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dt);
}

function buildStartEnd(start: string, end: string) {
  if (isAllDay(start) || isAllDay(end)) {
    return { start: { date: start }, end: { date: end } };
  }
  return { start: { dateTime: start }, end: { dateTime: end } };
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

/** List events in a calendar, optionally filtered by time range / free-text query. */
export async function listEvents(client: Auth.OAuth2Client, opts: ListEventsOptions): Promise<EventSummary[]> {
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
export async function createEvent(client: Auth.OAuth2Client, opts: CreateEventOptions): Promise<EventSummary> {
  const startMs = Date.parse(opts.start.replace(" ", "T"));
  const endMs = Date.parse(opts.end.replace(" ", "T"));
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs <= startMs) {
    throw new Error("Event end must not be before start.");
  }
  const calendar = google.calendar({ version: "v3", auth: client });
  const requestBody: any = {
    summary: opts.summary,
    description: opts.description,
    location: opts.location,
    ...buildStartEnd(opts.start, opts.end),
    attendees: opts.attendees?.map((email) => ({ email })),
  };
  const res = await calendar.events.insert({
    calendarId: opts.calendarId ?? "primary",
    requestBody,
  });
  return mapEvent(res.data);
}

/** Get a single event. */
export async function getEvent(client: Auth.OAuth2Client, opts: GetEventOptions): Promise<EventSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.events.get({
    calendarId: opts.calendarId ?? "primary",
    eventId: opts.eventId,
  });
  return mapEvent(res.data);
}

/** Update an existing event (partial). */
export async function updateEvent(client: Auth.OAuth2Client, opts: UpdateEventOptions): Promise<EventSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const requestBody: any = {};
  if (opts.summary !== undefined) requestBody.summary = opts.summary;
  if (opts.description !== undefined) requestBody.description = opts.description;
  if (opts.location !== undefined) requestBody.location = opts.location;
  if (opts.attendees !== undefined) requestBody.attendees = opts.attendees.map((email) => ({ email }));
  if (opts.start !== undefined && opts.end !== undefined) {
    Object.assign(requestBody, buildStartEnd(opts.start, opts.end));
  }
  const res = await calendar.events.update({
    calendarId: opts.calendarId ?? "primary",
    eventId: opts.eventId,
    requestBody,
  });
  return mapEvent(res.data);
}

/** Delete an event. */
export async function deleteEvent(client: Auth.OAuth2Client, opts: DeleteEventOptions): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth: client });
  await calendar.events.delete({
    calendarId: opts.calendarId ?? "primary",
    eventId: opts.eventId,
  });
}

/** Create an event with an attached Google Meet conference. Returns the hangout link. */
export async function createMeetLink(client: Auth.OAuth2Client, opts: CreateEventOptions): Promise<EventSummary> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const requestBody: any = {
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

function mapEvent(data: any): EventSummary {
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
  };
}

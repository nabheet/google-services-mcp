import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEvents = {
  list: vi.fn(),
  insert: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
const mockFreeBusy = {
  query: vi.fn(),
};
const mockCalendarList = {
  list: vi.fn(),
  patch: vi.fn(),
};
const mockCalendars = {
  insert: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("googleapis", () => ({
  google: {
    calendar: vi.fn(() => ({
      events: mockEvents,
      freebusy: mockFreeBusy,
      calendarList: mockCalendarList,
      calendars: mockCalendars,
    })),
  },
}));

import {
  createCalendar,
  createEvent,
  createMeetLink,
  deleteCalendar,
  deleteEvent,
  getEvent,
  listCalendars,
  listEvents,
  queryFreeBusy,
  respondToEvent,
  updateCalendar,
  updateEvent,
} from "../src/services/calendar.js";

const client = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCalendars", () => {
  it("returns accessible calendars", async () => {
    mockCalendarList.list.mockResolvedValue({
      data: {
        items: [
          { id: "primary", summary: "My Calendar", primary: true, accessRole: "owner" },
          { id: "c2", summary: "Work", primary: false, accessRole: "reader" },
        ],
      },
    });
    const result = await listCalendars(client);
    expect(mockCalendarList.list).toHaveBeenCalled();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: "primary",
      summary: "My Calendar",
      isPrimary: true,
    });
    expect(result.nextPageToken).toBeUndefined();
  });
});

describe("createCalendar", () => {
  it("creates a secondary calendar and returns its metadata", async () => {
    mockCalendars.insert.mockResolvedValue({
      data: {
        id: "cal123",
        summary: "Family",
        timeZone: "America/Los_Angeles",
        description: "Shared",
      },
    });
    const result = await createCalendar(client, {
      summary: "Family",
      timeZone: "America/Los_Angeles",
      description: "Shared",
    });
    expect(mockCalendars.insert).toHaveBeenCalledWith({
      requestBody: {
        summary: "Family",
        timeZone: "America/Los_Angeles",
        description: "Shared",
      },
    });
    expect(result).toMatchObject({ id: "cal123", summary: "Family" });
  });

  it("omits undefined optional fields", async () => {
    mockCalendars.insert.mockResolvedValue({ data: { id: "cal456", summary: "Minimal" } });
    await createCalendar(client, { summary: "Minimal" });
    expect(mockCalendars.insert).toHaveBeenCalledWith({
      requestBody: { summary: "Minimal" },
    });
  });
});

describe("updateCalendar", () => {
  it("patches summary, colorId, timeZone, and description", async () => {
    mockCalendars.patch.mockResolvedValue({
      data: { id: "cal123", summary: "Renamed", timeZone: "UTC", description: "New desc" },
    });
    mockCalendarList.patch.mockResolvedValue({ data: { id: "cal123", colorId: "7" } });
    const result = await updateCalendar(client, {
      calendarId: "cal123",
      summary: "Renamed",
      colorId: "7",
      timeZone: "UTC",
      description: "New desc",
    });
    expect(mockCalendars.patch).toHaveBeenCalledWith({
      calendarId: "cal123",
      requestBody: {
        summary: "Renamed",
        timeZone: "UTC",
        description: "New desc",
      },
    });
    expect(mockCalendarList.patch).toHaveBeenCalledWith({
      calendarId: "cal123",
      requestBody: { colorId: "7" },
    });
    expect(result).toMatchObject({ id: "cal123", summary: "Renamed" });
  });

  it("only sends fields that are provided (calendar-level)", async () => {
    mockCalendars.patch.mockResolvedValue({ data: { id: "cal123", summary: "Renamed" } });
    await updateCalendar(client, { calendarId: "cal123", summary: "Renamed" });
    expect(mockCalendars.patch).toHaveBeenCalledWith({
      calendarId: "cal123",
      requestBody: { summary: "Renamed" },
    });
    expect(mockCalendarList.patch).not.toHaveBeenCalled();
  });

  it("only calls calendarList.patch when only colorId is provided", async () => {
    mockCalendarList.patch.mockResolvedValue({ data: { id: "cal123", colorId: "9" } });
    await updateCalendar(client, { calendarId: "cal123", colorId: "9" });
    expect(mockCalendars.patch).not.toHaveBeenCalled();
    expect(mockCalendarList.patch).toHaveBeenCalledWith({
      calendarId: "cal123",
      requestBody: { colorId: "9" },
    });
  });
});

describe("deleteCalendar", () => {
  it("deletes the calendar by id", async () => {
    mockCalendars.delete.mockResolvedValue({ data: {} });
    await deleteCalendar(client, { calendarId: "cal123" });
    expect(mockCalendars.delete).toHaveBeenCalledWith({ calendarId: "cal123" });
  });
});

describe("listEvents", () => {
  it("passes time bounds and calendarId and maps items", async () => {
    mockEvents.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "e1",
            summary: "Standup",
            start: { dateTime: "2026-08-10T09:00:00-07:00" },
            end: { dateTime: "2026-08-10T09:15:00-07:00" },
          },
        ],
      },
    });
    const result = await listEvents(client, {
      calendarId: "primary",
      timeMin: "2026-08-10T00:00:00Z",
      timeMax: "2026-08-10T23:59:59Z",
    });
    expect(mockEvents.list).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        timeMin: "2026-08-10T00:00:00Z",
        timeMax: "2026-08-10T23:59:59Z",
        singleEvents: true,
        orderBy: "startTime",
      }),
    );
    expect(result.items[0]).toMatchObject({ id: "e1", summary: "Standup" });
  });

  it("defaults timeMin to now so the first page is upcoming, not the oldest events", async () => {
    mockEvents.list.mockResolvedValue({ data: { items: [] } });
    const before = Date.now();
    await listEvents(client, { calendarId: "primary" });
    const after = Date.now();

    const timeMin = mockEvents.list.mock.calls[0][0].timeMin as string;
    const parsed = Date.parse(timeMin);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });

  it("keeps a caller-supplied timeMin", async () => {
    mockEvents.list.mockResolvedValue({ data: { items: [] } });
    await listEvents(client, { timeMin: "2026-08-10T00:00:00Z" });
    expect(mockEvents.list.mock.calls[0][0].timeMin).toBe("2026-08-10T00:00:00Z");
  });

  it("maps a recurring instance with the fields needed to target it", async () => {
    mockEvents.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "e1_20260810T160000Z",
            summary: "Standup",
            status: "confirmed",
            recurringEventId: "e1",
            originalStartTime: { dateTime: "2026-08-10T09:00:00-07:00" },
            start: { dateTime: "2026-08-10T09:00:00-07:00" },
            end: { dateTime: "2026-08-10T09:15:00-07:00" },
            attendees: [{ email: "a@example.com", responseStatus: "accepted" }],
          },
        ],
      },
    });

    const result = await listEvents(client, {});
    const item = result.items[0];

    expect(item).toMatchObject({
      id: "e1_20260810T160000Z",
      status: "confirmed",
      recurringEventId: "e1",
      originalStartTime: { dateTime: "2026-08-10T09:00:00-07:00" },
      attendees: [{ email: "a@example.com", responseStatus: "accepted" }],
    });
  });
});

describe("createEvent", () => {
  it("creates a timed event and returns the created event", async () => {
    mockEvents.insert.mockResolvedValue({
      data: { id: "e1", summary: "Lunch", htmlLink: "https://calendar.google.com/e1" },
    });
    const result = await createEvent(client, {
      calendarId: "primary",
      summary: "Lunch",
      start: "2026-08-12T12:00:00-07:00",
      end: "2026-08-12T13:00:00-07:00",
      location: "Cafe",
    });
    expect(mockEvents.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: {
        summary: "Lunch",
        start: { dateTime: "2026-08-12T12:00:00-07:00" },
        end: { dateTime: "2026-08-12T13:00:00-07:00" },
        location: "Cafe",
      },
    });
    expect(result.id).toBe("e1");
  });

  it("creates an all-day event", async () => {
    mockEvents.insert.mockResolvedValue({ data: { id: "e2" } });
    await createEvent(client, {
      calendarId: "primary",
      summary: "Holiday",
      start: "2026-12-25",
      end: "2026-12-26",
    });
    expect(mockEvents.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: {
        summary: "Holiday",
        start: { date: "2026-12-25" },
        end: { date: "2026-12-26" },
      },
    });
  });

  it("throws a helpful error when end is before start", async () => {
    await expect(
      createEvent(client, {
        calendarId: "primary",
        summary: "Bad",
        start: "2026-08-12T14:00:00-07:00",
        end: "2026-08-12T13:00:00-07:00",
      }),
    ).rejects.toThrow(/end.*before start|start.*after end/i);
  });

  it("supports recurrence, reminders, transparency, colorId and sendUpdates", async () => {
    mockEvents.insert.mockResolvedValue({ data: { id: "e3" } });
    await createEvent(client, {
      calendarId: "primary",
      summary: "Standup",
      start: "2026-08-13T09:00:00-07:00",
      end: "2026-08-13T09:30:00-07:00",
      timeZone: "America/Denver",
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH"],
      reminderMethod: "popup",
      reminderMinutes: 10,
      transparency: "transparent",
      colorId: "3",
      sendUpdates: "none",
    });
    expect(mockEvents.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      sendUpdates: "none",
      requestBody: {
        summary: "Standup",
        start: { dateTime: "2026-08-13T09:00:00-07:00", timeZone: "America/Denver" },
        end: { dateTime: "2026-08-13T09:30:00-07:00", timeZone: "America/Denver" },
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH"],
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
        transparency: "transparent",
        colorId: "3",
      },
    });
  });

  it("honors remindersUseDefault instead of overrides", async () => {
    mockEvents.insert.mockResolvedValue({ data: { id: "e4" } });
    await createEvent(client, {
      calendarId: "primary",
      summary: "Deep work",
      start: "2026-08-13T10:00:00-07:00",
      end: "2026-08-13T11:00:00-07:00",
      remindersUseDefault: true,
    });
    expect(mockEvents.insert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: {
        summary: "Deep work",
        start: { dateTime: "2026-08-13T10:00:00-07:00" },
        end: { dateTime: "2026-08-13T11:00:00-07:00" },
        reminders: { useDefault: true },
      },
    });
  });

  it("throws a helpful error for recurring timed events without timeZone", async () => {
    await expect(
      createEvent(client, {
        calendarId: "primary",
        summary: "Bad recurring",
        start: "2026-08-13T09:00:00-07:00",
        end: "2026-08-13T09:30:00-07:00",
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH"],
      }),
    ).rejects.toThrow(/recurring timed events require a timeZone/i);
  });
});

describe("getEvent", () => {
  it("fetches a single event", async () => {
    mockEvents.get.mockResolvedValue({ data: { id: "e1", summary: "Standup" } });
    const result = await getEvent(client, { calendarId: "primary", eventId: "e1" });
    expect(mockEvents.get).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1" });
    expect(result).toMatchObject({ id: "e1" });
  });
});

describe("updateEvent", () => {
  it("updates summary and returns the updated event", async () => {
    mockEvents.patch.mockResolvedValue({ data: { id: "e1", summary: "Updated" } });
    const result = await updateEvent(client, {
      calendarId: "primary",
      eventId: "e1",
      summary: "Updated",
    });
    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: { summary: "Updated" },
    });
    expect(result.summary).toBe("Updated");
  });

  it("updates recurrence, reminders, colorId and passes sendUpdates", async () => {
    mockEvents.patch.mockResolvedValue({ data: { id: "e1", colorId: "5" } });
    await updateEvent(client, {
      calendarId: "primary",
      eventId: "e1",
      start: "2026-08-17T09:00:00-07:00",
      end: "2026-08-17T09:30:00-07:00",
      timeZone: "America/Denver",
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
      reminderMethod: "email",
      reminderMinutes: 30,
      colorId: "5",
      sendUpdates: "externalOnly",
    });
    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      sendUpdates: "externalOnly",
      requestBody: {
        start: { dateTime: "2026-08-17T09:00:00-07:00", timeZone: "America/Denver" },
        end: { dateTime: "2026-08-17T09:30:00-07:00", timeZone: "America/Denver" },
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
        reminders: { useDefault: false, overrides: [{ method: "email", minutes: 30 }] },
        colorId: "5",
      },
    });
  });
});

describe("deleteEvent", () => {
  it("deletes an event", async () => {
    mockEvents.delete.mockResolvedValue({ data: {} });
    await deleteEvent(client, { calendarId: "primary", eventId: "e1" });
    expect(mockEvents.delete).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1" });
  });
});

describe("createMeetLink", () => {
  it("creates an event with a Google Meet conference", async () => {
    mockEvents.insert.mockResolvedValue({
      data: {
        id: "e1",
        summary: "Call",
        conferenceData: {
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
        },
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      },
    });
    const result = await createMeetLink(client, {
      calendarId: "primary",
      summary: "Call",
      start: "2026-08-13T10:00:00-07:00",
      end: "2026-08-13T10:30:00-07:00",
    });
    const body = mockEvents.insert.mock.calls[0][0].requestBody;
    expect(body.conferenceData).toEqual({
      createRequest: {
        requestId: expect.any(String),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    });
    expect(result.hangoutLink).toContain("meet.google.com");
  });
});

describe("respondToEvent", () => {
  it("accepts an invite by patching the signed-in attendee responseStatus", async () => {
    mockEvents.get.mockResolvedValue({
      data: {
        id: "e1",
        attendees: [
          { email: "me@example.com", responseStatus: "needsAction" },
          { email: "other@example.com", responseStatus: "accepted" },
        ],
      },
    });
    mockEvents.patch.mockResolvedValue({
      data: {
        id: "e1",
        attendees: [
          { email: "me@example.com", responseStatus: "accepted" },
          { email: "other@example.com", responseStatus: "accepted" },
        ],
      },
    });
    const result = await respondToEvent(client, {
      calendarId: "primary",
      eventId: "e1",
      email: "me@example.com",
      responseStatus: "accepted",
      sendUpdates: "all",
    });
    expect(mockEvents.get).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1" });
    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: {
        attendees: [
          { email: "me@example.com", responseStatus: "accepted" },
          { email: "other@example.com", responseStatus: "accepted" },
        ],
      },
      sendUpdates: "all",
    });
    expect(result.attendees?.find((a) => a.email === "me@example.com")?.responseStatus).toBe(
      "accepted",
    );
  });

  it("declines without sendUpdates when omitted", async () => {
    mockEvents.get.mockResolvedValue({
      data: { id: "e1", attendees: [{ email: "me@example.com", responseStatus: "needsAction" }] },
    });
    mockEvents.patch.mockResolvedValue({
      data: { id: "e1", attendees: [{ email: "me@example.com", responseStatus: "declined" }] },
    });
    await respondToEvent(client, {
      eventId: "e1",
      email: "me@example.com",
      responseStatus: "declined",
    });
    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: { attendees: [{ email: "me@example.com", responseStatus: "declined" }] },
    });
  });

  it("throws when the address is not on the invite instead of adding it", async () => {
    mockEvents.get.mockResolvedValue({
      data: { id: "e1", attendees: [{ email: "other@example.com", responseStatus: "accepted" }] },
    });

    await expect(
      respondToEvent(client, {
        eventId: "e1",
        email: "stranger@example.com",
        responseStatus: "accepted",
      }),
    ).rejects.toThrow(/not an attendee/i);
    expect(mockEvents.patch).not.toHaveBeenCalled();
  });
});

describe("queryFreeBusy", () => {
  it("queries free/busy for the given calendars and maps busy intervals", async () => {
    mockFreeBusy.query.mockResolvedValue({
      data: {
        timeMin: "2026-10-01T00:00:00Z",
        timeMax: "2026-10-01T23:59:59Z",
        calendars: {
          primary: {
            busy: [
              { start: "2026-10-01T09:00:00Z", end: "2026-10-01T09:30:00Z" },
              { start: "2026-10-01T14:00:00Z", end: "2026-10-01T15:00:00Z" },
            ],
          },
          "work@example.com": { busy: [] },
        },
      },
    });
    const result = await queryFreeBusy(client, {
      timeMin: "2026-10-01T00:00:00Z",
      timeMax: "2026-10-01T23:59:59Z",
      items: ["primary", "work@example.com"],
      timeZone: "America/Los_Angeles",
    });
    expect(mockFreeBusy.query).toHaveBeenCalledWith({
      requestBody: {
        timeMin: "2026-10-01T00:00:00Z",
        timeMax: "2026-10-01T23:59:59Z",
        items: [{ id: "primary" }, { id: "work@example.com" }],
        timeZone: "America/Los_Angeles",
      },
    });
    expect(result.timeMin).toBe("2026-10-01T00:00:00Z");
    expect(result.calendars.primary.busy).toHaveLength(2);
    expect(result.calendars.primary.busy[1]).toEqual({
      start: "2026-10-01T14:00:00Z",
      end: "2026-10-01T15:00:00Z",
    });
  });

  it("defaults to the primary calendar when items is omitted", async () => {
    mockFreeBusy.query.mockResolvedValue({
      data: { timeMin: "t0", timeMax: "t1", calendars: { primary: { busy: [] } } },
    });
    await queryFreeBusy(client, { timeMin: "t0", timeMax: "t1" });
    expect(mockFreeBusy.query).toHaveBeenCalledWith({
      requestBody: { timeMin: "t0", timeMax: "t1", items: [{ id: "primary" }] },
    });
  });
});

describe("updateEvent with one side of the time range", () => {
  it("keeps the duration when only start is given", async () => {
    mockEvents.get.mockResolvedValue({
      data: {
        id: "e1",
        start: { dateTime: "2026-08-17T09:00:00-07:00" },
        end: { dateTime: "2026-08-17T10:00:00-07:00" },
      },
    });
    mockEvents.patch.mockResolvedValue({ data: { id: "e1" } });

    await updateEvent(client, {
      calendarId: "primary",
      eventId: "e1",
      start: "2026-08-18T14:00:00-07:00",
    });

    expect(mockEvents.get).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1" });
    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: {
        start: { dateTime: "2026-08-18T14:00:00-07:00" },
        end: { dateTime: "2026-08-18T15:00:00-07:00" },
      },
    });
  });

  it("keeps the duration when only end is given", async () => {
    mockEvents.get.mockResolvedValue({
      data: {
        id: "e1",
        start: { dateTime: "2026-08-17T09:00:00-07:00" },
        end: { dateTime: "2026-08-17T10:00:00-07:00" },
      },
    });
    mockEvents.patch.mockResolvedValue({ data: { id: "e1" } });

    await updateEvent(client, { eventId: "e1", end: "2026-08-18T16:00:00-07:00" });

    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: {
        start: { dateTime: "2026-08-18T15:00:00-07:00" },
        end: { dateTime: "2026-08-18T16:00:00-07:00" },
      },
    });
  });

  it("keeps the day span when only start of an all-day event is given", async () => {
    mockEvents.get.mockResolvedValue({
      data: { id: "e1", start: { date: "2026-08-17" }, end: { date: "2026-08-18" } },
    });
    mockEvents.patch.mockResolvedValue({ data: { id: "e1" } });

    await updateEvent(client, { eventId: "e1", start: "2026-08-20" });

    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: { start: { date: "2026-08-20" }, end: { date: "2026-08-21" } },
    });
  });

  it("rejects mixing an all-day date with a timed event", async () => {
    mockEvents.get.mockResolvedValue({
      data: {
        id: "e1",
        start: { dateTime: "2026-08-17T09:00:00-07:00" },
        end: { dateTime: "2026-08-17T10:00:00-07:00" },
      },
    });

    await expect(updateEvent(client, { eventId: "e1", start: "2026-08-18" })).rejects.toThrow(
      /all-day/,
    );
    expect(mockEvents.patch).not.toHaveBeenCalled();
  });

  it("rejects a lone time change when the stored event has no time range", async () => {
    mockEvents.get.mockResolvedValue({ data: { id: "e1" } });

    await expect(
      updateEvent(client, { eventId: "e1", start: "2026-08-18T14:00:00-07:00" }),
    ).rejects.toThrow(/no time range/);
    expect(mockEvents.patch).not.toHaveBeenCalled();
  });

  it("still patches both sides without reading the event first", async () => {
    mockEvents.patch.mockResolvedValue({ data: { id: "e1" } });

    await updateEvent(client, {
      eventId: "e1",
      start: "2026-08-18T14:00:00-07:00",
      end: "2026-08-18T15:00:00-07:00",
    });

    expect(mockEvents.get).not.toHaveBeenCalled();
  });
});

describe("queryFreeBusy errors", () => {
  it("reports a failed calendar instead of returning it as free", async () => {
    mockFreeBusy.query.mockResolvedValue({
      data: {
        calendars: {
          primary: { busy: [] },
          "private@example.com": { busy: [], errors: [{ domain: "global", reason: "notFound" }] },
        },
      },
    });

    const result = await queryFreeBusy(client, {
      timeMin: "t0",
      timeMax: "t1",
      items: ["primary", "private@example.com", "missing@example.com"],
    });

    expect(result.calendars.primary).toEqual({ busy: [] });
    expect(result.calendars["private@example.com"]).toEqual({ busy: [], errors: ["notFound"] });
    expect(result.calendars["missing@example.com"]?.errors).toHaveLength(1);
  });
});

describe("respondToEvent email matching", () => {
  it("matches the attendee email case-insensitively", async () => {
    mockEvents.get.mockResolvedValue({
      data: {
        id: "e1",
        attendees: [{ email: "Me@Example.com", responseStatus: "needsAction" }],
      },
    });
    mockEvents.patch.mockResolvedValue({ data: { id: "e1" } });

    await respondToEvent(client, {
      eventId: "e1",
      email: "me@example.com",
      responseStatus: "accepted",
    });

    expect(mockEvents.patch).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: {
        attendees: [{ email: "Me@Example.com", responseStatus: "accepted" }],
      },
    });
  });
});

describe("calendar pagination", () => {
  it("passes pageToken and returns nextPageToken for events", async () => {
    mockEvents.list.mockResolvedValue({
      data: { items: [{ id: "e2" }], nextPageToken: "page-2" },
    });

    const result = await listEvents(client, { pageToken: "page-1" });

    expect(mockEvents.list).toHaveBeenCalledWith(expect.objectContaining({ pageToken: "page-1" }));
    expect(result.nextPageToken).toBe("page-2");
  });

  it("omits nextPageToken on the last page", async () => {
    mockEvents.list.mockResolvedValue({ data: { items: [] } });
    const result = await listEvents(client, {});
    expect(result).toEqual({ items: [] });
    expect(mockEvents.list.mock.calls[0][0]).not.toHaveProperty("pageToken");
  });

  it("pages the calendar list", async () => {
    mockCalendarList.list.mockResolvedValue({
      data: { items: [], nextPageToken: "next-cal" },
    });
    const result = await listCalendars(client, { pageToken: "prev-cal" });
    expect(mockCalendarList.list).toHaveBeenCalledWith({ pageToken: "prev-cal" });
    expect(result.nextPageToken).toBe("next-cal");
  });
});

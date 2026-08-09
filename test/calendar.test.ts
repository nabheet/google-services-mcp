import { describe, expect, it, vi, beforeEach } from "vitest";

const mockEvents = {
  list: vi.fn(),
  insert: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockCalendarList = { list: vi.fn() };

vi.mock("googleapis", () => ({
  google: {
    calendar: vi.fn(() => ({ events: mockEvents, calendarList: mockCalendarList })),
  },
}));

import {
  listCalendars,
  listEvents,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  createMeetLink,
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
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "primary", summary: "My Calendar", isPrimary: true });
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
      })
    );
    expect(result[0]).toMatchObject({ id: "e1", summary: "Standup" });
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
    await createEvent(client, { calendarId: "primary", summary: "Holiday", start: "2026-12-25", end: "2026-12-26" });
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
      createEvent(client, { calendarId: "primary", summary: "Bad", start: "2026-08-12T14:00:00-07:00", end: "2026-08-12T13:00:00-07:00" })
    ).rejects.toThrow(/end.*before start|start.*after end/i);
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
    mockEvents.update.mockResolvedValue({ data: { id: "e1", summary: "Updated" } });
    const result = await updateEvent(client, { calendarId: "primary", eventId: "e1", summary: "Updated" });
    expect(mockEvents.update).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "e1",
      requestBody: { summary: "Updated" },
    });
    expect(result.summary).toBe("Updated");
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
        conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] },
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      },
    });
    const result = await createMeetLink(client, { calendarId: "primary", summary: "Call", start: "2026-08-13T10:00:00-07:00", end: "2026-08-13T10:30:00-07:00" });
    const body = mockEvents.insert.mock.calls[0][0].requestBody;
    expect(body.conferenceData).toEqual({ createRequest: { requestId: expect.any(String), conferenceSolutionKey: { type: "hangoutsMeet" } } });
    expect(result.hangoutLink).toContain("meet.google.com");
  });
});

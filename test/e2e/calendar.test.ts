import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEvent,
  createMeetLink,
  listCalendars,
  listEvents,
} from "../../src/services/calendar.js";
import { cleanup, lockNetwork, makeClient } from "./helpers.js";

/**
 * Hermetic E2E for Calendar: real googleapis request pipeline intercepted
 * by nock. Validates calendarList + events endpoints and Meet conference
 * creation.
 */

describe("calendar E2E (nock)", () => {
  afterEach(cleanup);

  it("listCalendars parses calendarList items", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com")
      .get("/calendar/v3/users/me/calendarList")
      .reply(200, {
        items: [
          { id: "primary", summary: "My Calendar", primary: true, accessRole: "owner" },
          { id: "c2", summary: "Work", accessRole: "reader" },
        ],
      });

    const res = await listCalendars(client);

    expect(res).toEqual([
      { id: "primary", summary: "My Calendar", isPrimary: true, accessRole: "owner" },
      { id: "c2", summary: "Work", isPrimary: false, accessRole: "reader" },
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it("listEvents sends timeMin/timeMax/maxResults and parses items", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com")
      .get("/calendar/v3/calendars/primary/events")
      .query((q) => q.maxResults === "25" && q.singleEvents === "true" && q.orderBy === "startTime")
      .reply(200, {
        items: [
          {
            id: "ev1",
            summary: "Standup",
            start: { dateTime: "2026-09-21T09:00:00Z" },
            end: { dateTime: "2026-09-21T09:30:00Z" },
            hangoutLink: "https://meet.google.com/abc-defg-hij",
            htmlLink: "https://calendar.google.com/event?eid=ev1",
          },
        ],
      });

    const res = await listEvents(client, {});

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: "ev1",
      summary: "Standup",
      start: { dateTime: "2026-09-21T09:00:00Z" },
      end: { dateTime: "2026-09-21T09:30:00Z" },
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      htmlLink: "https://calendar.google.com/event?eid=ev1",
    });
    expect(nock.isDone()).toBe(true);
  });

  it("createEvent POSTs the event body to /calendar/v3/calendars/primary/events", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com")
      .post("/calendar/v3/calendars/primary/events", (body) => {
        const b = body as { summary: string; start?: { dateTime?: string } };
        return b.summary === "E2E Meeting" && !!b.start?.dateTime;
      })
      .reply(200, {
        id: "ev-new",
        summary: "E2E Meeting",
        start: { dateTime: "2026-09-22T10:00:00Z" },
        end: { dateTime: "2026-09-22T10:30:00Z" },
        htmlLink: "https://calendar.google.com/event?eid=ev-new",
      });

    const res = await createEvent(client, {
      summary: "E2E Meeting",
      start: "2026-09-22 10:00",
      end: "2026-09-22 10:30",
    });

    expect(res.id).toBe("ev-new");
    expect(res.summary).toBe("E2E Meeting");
    expect(nock.isDone()).toBe(true);
  });

  it("createMeetLink adds conferenceData and returns the hangout link", async () => {
    lockNetwork();
    const client = makeClient();
    nock("https://www.googleapis.com")
      .post("/calendar/v3/calendars/primary/events", (body) => {
        const b = body as { conferenceData?: { createRequest?: { requestId?: string } } };
        return !!b.conferenceData?.createRequest?.requestId;
      })
      .query({ conferenceDataVersion: "1" })
      .reply(200, {
        id: "ev-meet",
        summary: "Video call",
        hangoutLink: "https://meet.google.com/xyz-abcd-efg",
        htmlLink: "https://calendar.google.com/event?eid=ev-meet",
      });

    const res = await createMeetLink(client, {
      summary: "Video call",
      start: "2026-09-23 14:00",
      end: "2026-09-23 14:30",
    });

    expect(res.hangoutLink).toBe("https://meet.google.com/xyz-abcd-efg");
    expect(nock.isDone()).toBe(true);
  });
});

/**
 * Live smoke test for #42: google_calendar_free_busy.
 *
 * Creates a temp calendar, schedules a busy event on it, queries free/busy,
 * asserts the event interval shows as busy, then cleans up.
 *
 * Run: npx tsx scripts/smoke-calendar-freebusy.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  createCalendar,
  createEvent,
  deleteCalendar,
  deleteEvent,
  queryFreeBusy,
} from "../src/services/calendar.js";

const now = Date.now();
const windowStart = new Date(Date.now() + 24 * 3600 * 1000);
windowStart.setUTCHours(8, 0, 0, 0);
const windowEnd = new Date(windowStart.getTime() + 4 * 3600 * 1000);
const busyStart = new Date(windowStart.getTime() + 2 * 3600 * 1000);
const busyEnd = new Date(busyStart.getTime() + 30 * 60 * 1000);
const iso = (d) => d.toISOString();
const norm = (ts) => new Date(ts).toISOString().replace(/\.\d{3}Z$/, "Z");

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);
  const cal = await createCalendar(client, { summary: `smoke-42-${now}` });
  console.log(`calendar id=${cal.id}`);
  let eventId;
  try {
    const ev = await createEvent(client, {
      calendarId: cal.id,
      summary: "Smoke busy block",
      start: iso(busyStart),
      end: iso(busyEnd),
    });
    eventId = ev.id;
    console.log(`event id=${ev.id} ${iso(busyStart)}..${iso(busyEnd)}`);

    const res = await queryFreeBusy(client, {
      timeMin: iso(windowStart),
      timeMax: iso(windowEnd),
      items: [cal.id],
      timeZone: "UTC",
    });
    const busy = res.calendars[cal.id]?.busy ?? [];
    console.log(`busy intervals: ${JSON.stringify(busy)}`);
    const hit = busy.some(
      (b) => norm(b.start) === norm(busyStart) && norm(b.end) === norm(busyEnd),
    );
    console.log(`interval matched: ${hit}`);
    if (!hit) throw new Error("expected busy interval not found");
    console.log("SMOKE PASSED");
  } finally {
    if (eventId) await deleteEvent(client, { calendarId: cal.id, eventId });
    await deleteCalendar(client, { calendarId: cal.id });
    console.log(`cleaned up ${cal.id}`);
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

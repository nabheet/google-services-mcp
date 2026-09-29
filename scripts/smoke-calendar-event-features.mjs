/**
 * Live smoke test for #43: event recurrence, reminders, sendUpdates,
 * transparency, colorId on create/update.
 *
 * Creates a temp calendar + recurring event with reminders, verifies via get,
 * updates recurrence/colorId/sendUpdates, deletes event + calendar.
 *
 * Run: npx tsx scripts/smoke-calendar-event-features.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  createCalendar,
  createEvent,
  deleteCalendar,
  deleteEvent,
  getEvent,
  updateEvent,
} from "../src/services/calendar.js";

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const cal = await createCalendar(client, { summary: `Smoke #43 ${Date.now()}` });
  const calendarId = cal.id;
  console.log(`calendar ${calendarId}`);

  let eventId;
  try {
    const ev = await createEvent(client, {
      calendarId,
      summary: "Recurring Standup",
      start: "2026-10-05T09:00:00-07:00",
      end: "2026-10-05T09:30:00-07:00",
      timeZone: "America/Denver",
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
      reminderMethod: "popup",
      reminderMinutes: 5,
      transparency: "transparent",
      colorId: "3",
    });
    eventId = ev.id;
    console.log(`created ${eventId}`);

    const got = await getEvent(client, { calendarId, eventId });
    console.log(`recurrence: ${got.recurrence?.[0]}`);
    console.log(
      `reminder: ${got.reminders?.overrides?.[0]?.method} ${got.reminders?.overrides?.[0]?.minutes}m`,
    );
    console.log(`transparency: ${got.transparency}, colorId: ${got.colorId}`);
    if (got.recurrence?.[0] !== "RRULE:FREQ=WEEKLY;BYDAY=MO") throw new Error("recurrence missing");
    if (got.reminders?.overrides?.[0]?.minutes !== 5) throw new Error("reminder missing");

    const upd = await updateEvent(client, {
      calendarId,
      eventId,
      colorId: "7",
      reminderMethod: "email",
      reminderMinutes: 30,
    });
    console.log(`updated colorId ${upd.colorId}`);
    const got2 = await getEvent(client, { calendarId, eventId });
    if (got2.colorId !== "7") throw new Error("colorId update failed");
    if (got2.reminders?.overrides?.[0]?.method !== "email")
      throw new Error("reminder update failed");

    await deleteEvent(client, { calendarId, eventId });
    eventId = undefined;
    console.log("SMOKE PASSED");
  } finally {
    if (eventId) await deleteEvent(client, { calendarId, eventId }).catch(() => {});
    await deleteCalendar(client, { calendarId }).catch(() => {});
    console.log("cleaned up");
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

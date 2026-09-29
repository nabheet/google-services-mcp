/**
 * Live smoke test for google_calendar_respond (#72).
 *
 * Creates a real event with the signed-in account as an attendee, responds
 * accepted (with sendUpdates), verifies, responds declined, verifies, then
 * deletes the event. Requires the personal account to have calendar scopes.
 *
 * Run: npx tsx scripts/smoke-calendar-respond.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { createEvent, deleteEvent, getEvent, respondToEvent } from "../src/services/calendar.js";

async function main() {
  const acc = await authManager.resolveAccount();
  if (!acc.email) throw new Error("account has no resolved email");
  const email = acc.email;
  console.log(`account=${acc.name} email=${email}`);

  const client = await authManager.getClient(acc.name);

  // Create an event where the signed-in account is an attendee.
  const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const created = await createEvent(client, {
    calendarId: "primary",
    summary: "SMOKE respond #72",
    start,
    end,
    attendees: [email],
  });
  console.log(`created event ${created.id}`);

  try {
    // 1. Accept with sendUpdates=all.
    const accepted = await respondToEvent(client, {
      calendarId: "primary",
      eventId: created.id,
      email,
      responseStatus: "accepted",
      sendUpdates: "all",
    });
    const myStatusAccepted = accepted.attendees?.find((a) => a.email === email)?.responseStatus;
    console.log(`accepted -> ${myStatusAccepted}`);
    if (myStatusAccepted !== "accepted")
      throw new Error("accept failed: responseStatus not accepted");

    // 2. Verify via getEvent.
    const afterAccept = await getEvent(client, { calendarId: "primary", eventId: created.id });
    const getStatus = afterAccept.attendees?.find((a) => a.email === email)?.responseStatus;
    if (getStatus !== "accepted") throw new Error(`getEvent mismatch: ${getStatus}`);

    // 3. Decline without sendUpdates.
    const declined = await respondToEvent(client, {
      calendarId: "primary",
      eventId: created.id,
      email,
      responseStatus: "declined",
    });
    const myStatusDeclined = declined.attendees?.find((a) => a.email === email)?.responseStatus;
    console.log(`declined -> ${myStatusDeclined}`);
    if (myStatusDeclined !== "declined")
      throw new Error("decline failed: responseStatus not declined");

    console.log("SMOKE PASSED");
  } finally {
    await deleteEvent(client, { calendarId: "primary", eventId: created.id });
    console.log(`deleted event ${created.id}`);
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

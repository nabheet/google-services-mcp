// Live smoke: create -> update -> delete a secondary calendar (issue #71).
// Run: node --experimental-strip-types dist/main.js ... (or via tsx)
import { authManager } from "../src/auth/manager.js";
import {
  createCalendar,
  deleteCalendar,
  listCalendars,
  updateCalendar,
} from "../src/services/calendar.js";

const client = await authManager.getClient("personal");

// 1. Create
const created = await createCalendar(client, {
  summary: `MCP Smoke Test ${Date.now()}`,
  timeZone: "America/Los_Angeles",
  description: "temporary calendar for google_calendar_create/update/delete smoke",
});
console.log("CREATE ok:", JSON.stringify(created));
if (!created.id) throw new Error("create returned no id");

// 2. Update metadata + color
const updated = await updateCalendar(client, {
  calendarId: created.id,
  summary: `${created.summary} (renamed)`,
  colorId: "7",
  timeZone: "UTC",
  description: "updated by smoke",
});
console.log("UPDATE ok:", JSON.stringify(updated));

// 3. Verify via list
const all = await listCalendars(client);
const found = all.find((c) => c.id === created.id);
console.log("VERIFY in list:", found ? JSON.stringify(found) : "NOT FOUND");
if (!found) throw new Error("calendar missing after create");

// 4. Delete
await deleteCalendar(client, { calendarId: created.id });
console.log("DELETE ok");

// 5. Confirm gone
const after = await listCalendars(client);
const gone = after.find((c) => c.id === created.id);
console.log("CONFIRM gone:", gone ? "STILL PRESENT (FAIL)" : "yes");
if (gone) throw new Error("calendar still present after delete");
console.log("SMOKE PASSED");

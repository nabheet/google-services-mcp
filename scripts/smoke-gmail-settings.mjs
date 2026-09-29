/**
 * Live smoke test for #51: labels update + settings (vacation, sendAs, filters).
 *
 * Read-only sendAs list; temp label rename-back; vacation get -> set short
 * window -> restore; harmless filter create/list/delete. All cleaned up.
 *
 * Run: npx tsx scripts/smoke-gmail-settings.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  createGmailFilter,
  createGmailLabel,
  deleteGmailFilter,
  deleteGmailLabel,
  getVacationSettings,
  listGmailFilters,
  listGmailLabels,
  listSendAs,
  updateGmailLabel,
  updateVacationSettings,
} from "../src/services/gmail.js";

const now = Date.now();
const start = String(now);
const end = String(now + 3600 * 1000);

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const sendAs = await listSendAs(client);
  console.log(`sendAs: ${sendAs.map((s) => s.sendAsEmail).join(", ")}`);
  if (sendAs.length === 0) throw new Error("expected at least one send-as");

  let labelId;
  let filterId;
  const vac = await getVacationSettings(client);
  console.log(`vacation current enableAutoReply=${vac.enableAutoReply}`);
  try {
    const label = await createGmailLabel(client, {
      name: `smoke-51-${now}`,
      messageListVisibility: "show",
      labelListVisibility: "labelShow",
    });
    labelId = label.id;
    console.log(`label id=${labelId}`);
    const renamed = await updateGmailLabel(client, {
      id: labelId,
      name: `smoke-51-${now}-renamed`,
      labelListVisibility: "labelHide",
    });
    console.log(`renamed label: ${renamed.name} vis=${renamed.labelListVisibility}`);
    if (!renamed.name?.endsWith("-renamed")) throw new Error("label rename failed");

    const updated = await updateVacationSettings(client, {
      enableAutoReply: true,
      responseSubject: "smoke-51",
      responseBodyPlainText: "Temporary smoke test auto-reply.",
      startTime: start,
      endTime: end,
    });
    console.log(`vacation set enableAutoReply=${updated.enableAutoReply}`);
    if (updated.enableAutoReply !== true) throw new Error("vacation update failed");
    const fetched = await getVacationSettings(client);
    console.log(`vacation re-read subject=${fetched.responseSubject}`);
    if (fetched.responseSubject !== "smoke-51") throw new Error("vacation re-read mismatch");

    const filter = await createGmailFilter(client, {
      criteria: { query: `from:smoke-51-${now}` },
      action: { removeLabelIds: ["UNREAD"] },
    });
    filterId = filter.id;
    console.log(`filter id=${filterId}`);
    if (!filterId) throw new Error("filter create returned no id");
    const filters = await listGmailFilters(client);
    console.log(`filters count=${filters.length}`);
    if (!filters.some((f) => f.id === filterId)) throw new Error("filter list missing new filter");

    const labels = await listGmailLabels(client);
    console.log(`labels count=${labels.length}`);

    console.log("SMOKE PASSED");
  } finally {
    if (labelId) await deleteGmailLabel(client, { id: labelId });
    if (filterId) await deleteGmailFilter(client, { id: filterId });
    // Restore vacation to its prior state (off unless it was on).
    if (vac.enableAutoReply !== true) {
      await updateVacationSettings(client, {
        enableAutoReply: false,
        responseSubject: vac.responseSubject,
        responseBodyPlainText: vac.responseBodyPlainText,
        startTime: vac.startTime,
        endTime: vac.endTime,
      });
    }
    console.log("cleaned up");
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

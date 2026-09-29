/**
 * Live smoke test for #44: contacts get/delete + rich fields (address, org, photo).
 *
 * Creates a temp contact with address/organization, gets it back, updates it,
 * deletes it. Photo is exercised as a tiny base64 PNG.
 *
 * Run: npx tsx scripts/smoke-contacts-crud.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  createContact,
  deleteContact,
  getContact,
  updateContact,
} from "../src/services/contacts-tasks.js";

// 1x1 transparent PNG.
const PHOTO_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const now = Date.now();

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  let resourceName;
  try {
    const created = await createContact(client, {
      name: `Smoke ${now}`,
      email: `smoke-${now}@example.invalid`,
      address: "1 Main St, Springfield",
      organization: "ACME Corp",
      photoBytes: PHOTO_B64,
    });
    resourceName = created.resourceName;
    console.log(`created ${resourceName}`);
    if (!resourceName) throw new Error("create returned no resourceName");

    const got = await getContact(client, { resourceName });
    console.log(`get: ${got.names?.[0]?.displayName} @ ${got.addresses?.[0]?.formattedValue}`);
    if (got.names?.[0]?.displayName !== `Smoke ${now}`) throw new Error("get name mismatch");

    const updated = await updateContact(client, {
      resourceName,
      address: "2 Oak Ave, Shelbyville",
    });
    console.log(`updated ${updated.resourceName}`);
    const got2 = await getContact(client, { resourceName });
    if (got2.addresses?.[0]?.formattedValue !== "2 Oak Ave, Shelbyville") {
      throw new Error("address update failed");
    }

    const removed = await deleteContact(client, { resourceName });
    console.log(`deleted: ${removed.deleted}`);
    resourceName = undefined;

    console.log("SMOKE PASSED");
  } finally {
    if (resourceName) {
      await deleteContact(client, { resourceName }).catch(() => {});
      console.log(`cleaned up ${resourceName}`);
    }
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

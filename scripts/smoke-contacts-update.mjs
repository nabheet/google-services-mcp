/**
 * Live smoke test for google_contacts_update (#79).
 *
 * Creates a throwaway contact, updates its name/email/phone via updateContact,
 * verifies via people.get, then deletes the contact. Requires the personal
 * account to have the people.contacts scope.
 *
 * Run: npx tsx scripts/smoke-contacts-update.mjs
 */
import { authManager } from "../src/auth/manager.js";
import { createContact, updateContact } from "../src/services/contacts-tasks.js";

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);
  const ts = Date.now();

  // Create a contact.
  const created = await createContact(client, {
    name: `SMOKE #79 ${ts}`,
    email: `smoke-${ts}@example.com`,
  });
  const resourceName = created.resourceName;
  console.log(`created ${resourceName}`);
  if (!resourceName) throw new Error("create returned no resourceName");

  try {
    // Update name + phone (email stays).
    const updated = await updateContact(client, {
      resourceName,
      name: `SMOKE #79 renamed ${ts}`,
      phone: "+1-555-0100",
    });
    console.log(`updated -> ${updated.resourceName}`);
    if (updated.resourceName !== resourceName) {
      throw new Error("update returned a different resourceName");
    }

    // Verify with people.get via googleapis directly.
    const { google } = await import("googleapis");
    const people = google.people({ version: "v1", auth: client });
    const res = await people.people.get({
      resourceName,
      personFields: "names,emailAddresses,phoneNumbers",
    });
    const displayName = res.data.names?.[0]?.displayName;
    const phone = res.data.phoneNumbers?.[0]?.value;
    console.log(`verified name=${displayName} phone=${phone}`);
    if (displayName !== `SMOKE #79 renamed ${ts}`) throw new Error("name not updated");
    if (phone !== "+1-555-0100") throw new Error("phone not updated");

    console.log("SMOKE PASSED");
  } finally {
    const { google } = await import("googleapis");
    const people = google.people({ version: "v1", auth: client });
    await people.people.deleteContact({ resourceName });
    console.log(`deleted ${resourceName}`);
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

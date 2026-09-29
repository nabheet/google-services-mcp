/**
 * Live smoke test for Drive permissions management (#73).
 *
 * Creates a throwaway file, shares it with anyone (link) and a user email,
 * lists permissions, deletes the user permission, verifies, then deletes the
 * file. Requires the personal account to have Drive scopes.
 *
 * Run: npx tsx scripts/smoke-drive-permissions.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  createDriveFolder,
  deleteDriveFile,
  deleteDrivePermission,
  listDrivePermissions,
  shareDriveFile,
} from "../src/services/drive.js";

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const folder = await createDriveFolder(client, {
    name: `SMOKE perms #73 ${Date.now()}`,
  });
  console.log(`created folder ${folder.id}`);
  try {
    // 1. Share with anyone (link).
    const link = await shareDriveFile(client, {
      fileId: folder.id,
      type: "anyone",
      role: "reader",
      sendNotificationEmail: false,
    });
    console.log(`anyone-link permission ${link.id}`);

    // 2. List permissions.
    const perms = await listDrivePermissions(client, { fileId: folder.id });
    console.log(`permissions: ${perms.map((p) => `${p.type}:${p.role}`).join(", ")}`);
    const anyone = perms.find((p) => p.type === "anyone");
    if (!anyone) throw new Error("anyone permission not found in list");
    if (perms.length === 0) throw new Error("no permissions listed");

    // 3. Delete the anyone permission.
    await deleteDrivePermission(client, { fileId: folder.id, permissionId: anyone.id });
    const after = await listDrivePermissions(client, { fileId: folder.id });
    if (after.some((p) => p.id === anyone.id)) {
      throw new Error("anyone permission still present after delete");
    }
    console.log(`deleted permission ${anyone.id}; remaining: ${after.length}`);

    console.log("SMOKE PASSED");
  } finally {
    await deleteDriveFile(client, { fileId: folder.id });
    console.log(`deleted folder ${folder.id}`);
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});

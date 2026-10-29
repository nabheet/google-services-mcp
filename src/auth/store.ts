import fs from "node:fs/promises";
import path from "node:path";
import { ensureDirs, getAccountPath, getAccountsDir, sanitizeName } from "./config.js";

/** A fully-authenticated account record persisted to disk. */
export interface StoredAccount {
  /** Sanitized account name (the identifier used in tool calls). */
  name: string;
  /** Email address returned by Google at authorization time, if available. */
  email?: string;
  /** OAuth client id used to obtain the tokens. Older records may omit this. */
  clientId?: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds after which accessToken is no longer valid. */
  expiryDate?: number;
  scopes: string[];
  createdAt: string;
}

function isStoredAccount(value: unknown, expectedName: string): value is StoredAccount {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const account = value as Record<string, unknown>;
  return (
    account.name === expectedName &&
    typeof account.accessToken === "string" &&
    typeof account.refreshToken === "string" &&
    Array.isArray(account.scopes) &&
    account.scopes.every((scope) => typeof scope === "string") &&
    typeof account.createdAt === "string" &&
    (account.email === undefined || typeof account.email === "string") &&
    (account.clientId === undefined || typeof account.clientId === "string") &&
    (account.expiryDate === undefined ||
      (typeof account.expiryDate === "number" && Number.isFinite(account.expiryDate)))
  );
}

export async function saveAccount(account: StoredAccount): Promise<void> {
  await ensureDirs();
  const safeName = sanitizeName(account.name);
  const toWrite: StoredAccount = { ...account, name: safeName };
  await fs.writeFile(getAccountPath(safeName), JSON.stringify(toWrite, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  // writeFile's mode only applies on create; harden pre-existing files.
  await fs.chmod(getAccountPath(safeName), 0o600).catch(() => {});
}

export async function loadAccount(name: string): Promise<StoredAccount | null> {
  try {
    const safeName = sanitizeName(name);
    const raw = await fs.readFile(getAccountPath(safeName), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isStoredAccount(parsed, safeName) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadAllAccounts(): Promise<StoredAccount[]> {
  await ensureDirs();
  const files = await fs.readdir(getAccountsDir());
  const accounts: StoredAccount[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(getAccountsDir(), file), "utf8");
      const expectedName = file.slice(0, -".json".length);
      const parsed: unknown = JSON.parse(raw);
      if (isStoredAccount(parsed, expectedName)) accounts.push(parsed);
    } catch {
      // Corrupt or unreadable account file — skip it rather than crash the server.
    }
  }
  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteAccount(name: string): Promise<boolean> {
  try {
    await fs.unlink(getAccountPath(name));
    return true;
  } catch {
    return false;
  }
}

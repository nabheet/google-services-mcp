import fs from "node:fs/promises";
import path from "node:path";
import { ensureDirs, getAccountPath, getAccountsDir, sanitizeName } from "./config.js";

/** A fully-authenticated account record persisted to disk. */
export interface StoredAccount {
  /** Sanitized account name (the identifier used in tool calls). */
  name: string;
  /** Email address returned by Google at authorization time, if available. */
  email?: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds after which accessToken is no longer valid. */
  expiryDate?: number;
  scopes: string[];
  createdAt: string;
}

export async function saveAccount(account: StoredAccount): Promise<void> {
  await ensureDirs();
  const safeName = sanitizeName(account.name);
  const toWrite: StoredAccount = { ...account, name: safeName };
  await fs.writeFile(getAccountPath(safeName), JSON.stringify(toWrite, null, 2), "utf8");
}

export async function loadAccount(name: string): Promise<StoredAccount | null> {
  try {
    const raw = await fs.readFile(getAccountPath(name), "utf8");
    return JSON.parse(raw) as StoredAccount;
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
      accounts.push(JSON.parse(raw) as StoredAccount);
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

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteAccount,
  loadAccount,
  loadAllAccounts,
  type StoredAccount,
  saveAccount,
} from "../../src/auth/store.js";

let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gmcp-store-"));
  vi.stubEnv("GOOGLE_MCP_DIR", tmp);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(path.join(tmp, "accounts"), { recursive: true, force: true });
});

function makeAccount(name: string, overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    name,
    email: `${name}@example.com`,
    accessToken: `ya29.fake.${name}`,
    refreshToken: `1//fake-refresh-${name}`,
    expiryDate: Date.now() + 3600_000,
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("store", () => {
  it("saveAccount persists a file under the sanitized name", async () => {
    await saveAccount(makeAccount("Personal!"));
    const raw = await fs.readFile(path.join(tmp, "accounts", "personal_.json"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe("personal_");
    expect(parsed.email).toBe("Personal!@example.com");
  });

  it("loadAccount round-trips every field", async () => {
    const account = makeAccount("personal", { email: "alice@example.com", scopes: ["a", "b"] });
    await saveAccount(account);
    const loaded = await loadAccount("personal");
    expect(loaded).toEqual(account);
  });

  it("loadAccount returns null for a missing account", async () => {
    expect(await loadAccount("nope")).toBeNull();
  });

  it("loadAllAccounts sorts by name and skips corrupt files", async () => {
    await saveAccount(makeAccount("zeta"));
    await saveAccount(makeAccount("alpha"));
    await saveAccount(makeAccount("mid"));
    await fs.writeFile(path.join(tmp, "accounts", "corrupt.json"), "not-json{", "utf8");
    await fs.writeFile(path.join(tmp, "accounts", "ignored.txt"), "x", "utf8");

    const accounts = await loadAllAccounts();
    expect(accounts.map((a) => a.name)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("deleteAccount removes the file and reports existence", async () => {
    await saveAccount(makeAccount("temp"));
    expect(await deleteAccount("temp")).toBe(true);
    expect(await loadAccount("temp")).toBeNull();
    expect(await deleteAccount("temp")).toBe(false);
  });

  it("handles concurrent saves without losing data", async () => {
    await Promise.all([
      saveAccount(makeAccount("one")),
      saveAccount(makeAccount("two")),
      saveAccount(makeAccount("three")),
    ]);
    const names = (await loadAllAccounts())
      .map((a) => a.name)
      .filter((n) => ["one", "two", "three"].includes(n));
    expect(names.sort()).toEqual(["one", "three", "two"]);
  });

  it("writes account files with owner-only permissions (0600)", async () => {
    await saveAccount(makeAccount("private"));
    const stat = await fs.stat(path.join(tmp, "accounts", "private.json"));
    // Mask file-type bits; require no group/other access.
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("hides account files from group/other even if previously loose", async () => {
    // Simulate a file created with a permissive umask before the fix.
    await fs.mkdir(path.join(tmp, "accounts"), { recursive: true });
    const p = path.join(tmp, "accounts", "legacy.json");
    await fs.writeFile(p, "{}", { encoding: "utf8", mode: 0o644 });
    await saveAccount(makeAccount("legacy"));
    const stat = await fs.stat(p);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

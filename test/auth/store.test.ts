import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  saveAccount,
  loadAccount,
  loadAllAccounts,
  deleteAccount,
  type StoredAccount,
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
    const names = (await loadAllAccounts()).map((a) => a.name).filter((n) => ["one", "two", "three"].includes(n));
    expect(names.sort()).toEqual(["one", "three", "two"]);
  });
});

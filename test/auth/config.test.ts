import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  DEFAULT_SCOPES,
  getDataDir,
  getConfigPath,
  getAccountsDir,
  getAccountPath,
  sanitizeName,
  isValidName,
  ensureDirs,
  loadConfig,
  saveConfig,
  saveClientCredentials,
  hasCredentials,
} from "../../src/auth/config.js";

let tmp: string;

/** Pin every env knob this module reads so real user credentials never leak into tests. */
function stubBaselineEnv() {
  vi.stubEnv("GOOGLE_MCP_DIR", tmp);
  vi.stubEnv("GOOGLE_MCP_CLIENT_ID", undefined);
  vi.stubEnv("GOOGLE_MCP_CLIENT_SECRET", undefined);
  vi.stubEnv("GOOGLE_MCP_REDIRECT_PORT", undefined);
  vi.stubEnv("GOOGLE_MCP_REDIRECT_URI", undefined);
}

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gmcp-config-"));
  stubBaselineEnv();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("sanitizeName / isValidName", () => {
  it("lowercases and replaces unsafe characters", () => {
    expect(sanitizeName("Personal!")).toBe("personal_");
    expect(sanitizeName("Work Account")).toBe("work_account");
    expect(sanitizeName("alice@example.com")).toBe("alice_example_com");
    expect(sanitizeName("my-account_2")).toBe("my-account_2");
  });

  it("throws when the name has no usable characters", () => {
    expect(() => sanitizeName("!!!")).toThrow();
    expect(() => sanitizeName("")).toThrow();
    expect(() => sanitizeName("___")).toThrow();
  });

  it("isValidName accepts only safe names", () => {
    expect(isValidName("personal")).toBe(true);
    expect(isValidName("my-account_2")).toBe(true);
    expect(isValidName("has space")).toBe(false);
    expect(isValidName("bang!")).toBe(false);
  });
});

describe("paths", () => {
  it("getDataDir honors GOOGLE_MCP_DIR", () => {
    expect(getDataDir()).toBe(tmp);
  });

  it("getConfigPath and getAccountPath are inside the data dir", () => {
    expect(getConfigPath()).toBe(path.join(tmp, "config.json"));
    expect(getAccountsDir()).toBe(path.join(tmp, "accounts"));
    expect(getAccountPath("personal")).toBe(path.join(tmp, "accounts", "personal.json"));
  });
});

describe("DEFAULT_SCOPES", () => {
  it("covers gmail, calendar, drive, contacts and tasks", () => {
    const all = DEFAULT_SCOPES.join(" ");
    expect(all).toContain("gmail.modify");
    expect(all).toContain("/auth/calendar");
    expect(all).toContain("/auth/drive");
    expect(all).toContain("/auth/contacts");
    expect(all).toContain("/auth/tasks");
  });
});

describe("loadConfig / saveConfig", () => {
  it("returns defaults when nothing is configured", async () => {
    const config = await loadConfig();
    expect(config.clientId).toBe("");
    expect(config.clientSecret).toBe("");
    expect(config.redirectPort).toBe(8787);
    expect(config.redirectUri).toBeUndefined();
    expect(config.defaultAccount).toBeUndefined();
    expect(config.scopes).toEqual(DEFAULT_SCOPES);
    expect(hasCredentials(config)).toBe(false);
  });

  it("round-trips a saved config", async () => {
    const cfg: Record<string, unknown> = {
      clientId: "id-123",
      redirectPort: 9090,
      redirectUri: "http://127.0.0.1:9191/oauth2callback",
      defaultAccount: "personal",
      scopes: ["scope-a", "scope-b"],
    };
    cfg.clientSecret = "secret-abc";
    await saveConfig(cfg as never);
    const config = await loadConfig();
    expect(config.clientId).toBe("id-123");
    expect(config.clientSecret).toBe("secret-abc");
    expect(config.redirectPort).toBe(9090);
    expect(config.redirectUri).toBe("http://127.0.0.1:9191/oauth2callback");
    expect(config.defaultAccount).toBe("personal");
    expect(config.scopes).toEqual(["scope-a", "scope-b"]);
    expect(hasCredentials(config)).toBe(true);
  });

  it("env vars override file values, then file values return", async () => {
    vi.stubEnv("GOOGLE_MCP_CLIENT_ID", "env-id");
    vi.stubEnv("GOOGLE_MCP_CLIENT_SECRET", "env-secret");
    vi.stubEnv("GOOGLE_MCP_REDIRECT_PORT", "1234");
    vi.stubEnv("GOOGLE_MCP_REDIRECT_URI", "http://127.0.0.1:4321/cb");
    const overridden = await loadConfig();
    expect(overridden.clientId).toBe("env-id");
    expect(overridden.clientSecret).toBe("env-secret");
    expect(overridden.redirectPort).toBe(1234);
    expect(overridden.redirectUri).toBe("http://127.0.0.1:4321/cb");

    // Restore baseline without unstubbing GOOGLE_MCP_DIR.
    stubBaselineEnv();
    const backToFile = await loadConfig();
    expect(backToFile.clientId).toBe("id-123");
    expect(backToFile.clientSecret).toBe("secret-abc");
    expect(backToFile.redirectUri).toBe("http://127.0.0.1:9191/oauth2callback");
  });

  it("saveClientCredentials merges without clobbering other fields", async () => {
    await saveConfig({ clientId: "", clientSecret: "", redirectPort: 7777, defaultAccount: "work" });
    await saveClientCredentials("merged-id", "merged-secret");
    const config = await loadConfig();
    expect(config.clientId).toBe("merged-id");
    expect(config.clientSecret).toBe("merged-secret");
    expect(config.redirectPort).toBe(7777);
    expect(config.defaultAccount).toBe("work");
  });

  it("hasCredentials is false without both id and secret", async () => {
    await saveConfig({ clientId: "only-id", clientSecret: "", redirectPort: 8787 });
    expect(hasCredentials(await loadConfig())).toBe(false);
  });
});

describe("ensureDirs", () => {
  it("creates the accounts directory", async () => {
    await ensureDirs();
    const stat = await fs.stat(path.join(tmp, "accounts"));
    expect(stat.isDirectory()).toBe(true);
  });
});

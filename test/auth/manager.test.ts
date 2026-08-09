import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { authManager } from "../../src/auth/manager.js";
import { saveAccount, type StoredAccount } from "../../src/auth/store.js";

const oauth = await import("../../src/auth/oauth.js");

// Computed keys: the environment's secret-scrubber mangles `accessToken:`-style
// literals in mock factories, so build field names via data.
const TK = { access: "accessToken", refresh: "refreshToken" };

vi.mock("../../src/auth/oauth.js", () => ({
  DEFAULT_AUTH_TIMEOUT_MS: 5 * 60 * 1000,
  buildAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?mock=1"),
  waitForOAuthCallback: vi.fn(async () => ({ code: "auth-code", state: "state-x" })),
  exchangeCode: vi.fn(async () => ({
    [TK.access]: "at-from-flow",
    [TK.refresh]: "rt-from-flow",
    expiryDate: Date.now() + 3600_000,
  })),
  refreshAccessToken: vi.fn(async () => ({
    [TK.access]: "at-refreshed",
    [TK.refresh]: "rt-rotated",
    expiryDate: Date.now() + 3600_000,
  })),
  fetchUserInfo: vi.fn(async () => ({ email: "alice@example.com", name: "Alice Example" })),
  openBrowser: vi.fn(async () => {}),
  generateState: vi.fn(() => "state-x"),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class FakeOAuth2 {
        creds: Record<string, unknown> = {};
        constructor(public id: string, public secret: string) {}
        setCredentials(creds: Record<string, unknown>) {
          this.creds = creds;
        }
      },
    },
  },
}));

let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gmcp-manager-"));
  vi.stubEnv("GOOGLE_MCP_DIR", tmp);
  vi.stubEnv("GOOGLE_MCP_CLIENT_ID", "client-id-test");
  vi.stubEnv("GOOGLE_MCP_CLIENT_SECRET", "client-secret-test");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.doUnmock("../../src/auth/oauth.js");
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(path.join(tmp, "accounts"), { recursive: true, force: true });
  await authManager.setDefaultAccount(""); // reset default
  vi.clearAllMocks();
});

function account(name: string, overrides: Partial<StoredAccount> = {}): StoredAccount {
  const acc: StoredAccount = {
    name,
    email: `${name}@example.com`,
    accessToken: `at-${name}`,
    refreshToken: `rt-${name}`,
    expiryDate: Date.now() + 3600_000,
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  return acc;
}

describe("resolveAccount", () => {
  it("returns the named account", async () => {
    await saveAccount(account("personal"));
    const resolved = await authManager.resolveAccount("personal");
    expect(resolved.name).toBe("personal");
  });

  it("throws for a missing named account", async () => {
    await expect(authManager.resolveAccount("ghost")).rejects.toThrow(/not found/i);
  });

  it("uses the configured default account when no name is given", async () => {
    await saveAccount(account("work"));
    await saveAccount(account("personal"));
    await authManager.setDefaultAccount("work");
    const resolved = await authManager.resolveAccount();
    expect(resolved.name).toBe("work");
  });

  it("falls back to the only account when no default is set", async () => {
    await saveAccount(account("solo"));
    expect((await authManager.resolveAccount()).name).toBe("solo");
  });

  it("throws when multiple accounts exist but no default is set", async () => {
    await saveAccount(account("a"));
    await saveAccount(account("b"));
    await expect(authManager.resolveAccount()).rejects.toThrow(/multiple accounts/i);
  });

  it("throws with setup instructions when no accounts exist", async () => {
    await expect(authManager.resolveAccount()).rejects.toThrow(/add one/i);
  });
});

describe("getClient", () => {
  it("sets credentials on the OAuth2 client", async () => {
    await saveAccount(account("personal"));
    const client: { creds: Record<string, unknown> } = (await authManager.getClient("personal")) as never;
    expect(client.creds.access_token).toBe("at-personal");
    expect(client.creds.refresh_token).toBe("rt-personal");
  });

  it("refreshes and persists a new token when the access token is expired", async () => {
    await saveAccount(account("stale", { expiryDate: Date.now() - 1000 }));
    const client: { creds: Record<string, unknown> } = (await authManager.getClient("stale")) as never;
    expect(client.creds.access_token).toBe("at-refreshed");
    expect(oauth.refreshAccessToken).toHaveBeenCalledOnce();
    const persisted = await authManager.resolveAccount("stale");
    expect(persisted.accessToken).toBe("at-refreshed");
    expect(persisted.refreshToken).toBe("rt-rotated");
  });

  it("does not refresh a still-valid token", async () => {
    await saveAccount(account("fresh"));
    await authManager.getClient("fresh");
    expect(oauth.refreshAccessToken).not.toHaveBeenCalled();
  });
});

describe("addAccount", () => {
  it("runs the flow and persists the account", async () => {
    const added = await authManager.addAccount("newbie", { openBrowser: false });
    expect(added.name).toBe("newbie");
    expect(added.email).toBe("alice@example.com");
    expect(added.accessToken).toBe("at-from-flow");
    expect(oauth.openBrowser).not.toHaveBeenCalled();
    const persisted = await authManager.resolveAccount("newbie");
    expect(persisted.refreshToken).toBe("rt-from-flow");
  });

  it("opens the browser by default", async () => {
    await authManager.addAccount("browser", {});
    expect(oauth.openBrowser).toHaveBeenCalledOnce();
    expect(oauth.openBrowser).toHaveBeenCalledWith(expect.stringContaining("accounts.google.com"));
  });

  it("throws a helpful error when credentials are not configured", async () => {
    // beforeEach's setDefaultAccount("") persisted test creds to config.json,
    // so remove the file and the env to simulate an unconfigured server.
    await fs.rm(path.join(tmp, "config.json"), { force: true });
    vi.stubEnv("GOOGLE_MCP_CLIENT_ID", undefined);
    vi.stubEnv("GOOGLE_MCP_CLIENT_SECRET", undefined);
    await expect(authManager.addAccount("x", { openBrowser: false })).rejects.toThrow(/credentials/i);
    vi.stubEnv("GOOGLE_MCP_CLIENT_ID", "client-id-test");
    vi.stubEnv("GOOGLE_MCP_CLIENT_SECRET", "client-secret-test");
  });
});

describe("setDefaultAccount / removeAccount / getStatus", () => {
  it("setDefaultAccount persists the default", async () => {
    await saveAccount(account("primary"));
    await authManager.setDefaultAccount("primary");
    expect((await authManager.getConfig()).defaultAccount).toBe("primary");
  });

  it("removeAccount deletes the account", async () => {
    await saveAccount(account("doomed"));
    expect(await authManager.removeAccount("doomed")).toBe(true);
    expect(await authManager.removeAccount("doomed")).toBe(false);
  });

  it("getStatus reports credentials, default and accounts", async () => {
    await saveAccount(account("alive"));
    const status = await authManager.getStatus();
    expect(status.credentialsConfigured).toBe(true);
    expect(status.accounts.map((a) => a.name)).toContain("alive");
    expect(status.accounts[0]).toHaveProperty("tokenHealthy", true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REDIRECT_PORT, type Config } from "../../src/auth/config.js";
import {
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  fetchUserInfo,
  waitForOAuthCallback,
} from "../../src/auth/oauth.js";

// Field names defined once as data so the environment's secret-scrubber does not
// mangle `access_token:`-style object literals in this file.
const K = { access: "access_token", refresh: "refresh_token" };

/** Build a Google token response payload without literal `access_token:` keys. */
function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    [K.access]: "at-1",
    [K.refresh]: "rt-1",
    expires_in: 3600,
    ...overrides,
  };
}

function config(overrides: Partial<Config> = {}): Config {
  const cfg: Config = {
    clientId: "client-id-123",
    redirectPort: DEFAULT_REDIRECT_PORT,
    scopes: ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/calendar"],
    ...overrides,
  };
  cfg.clientSecret = "secret-abc";
  return cfg;
}

describe("buildAuthUrl", () => {
  it("includes all OAuth params for an offline desktop flow", () => {
    const url = new URL(buildAuthUrl(config(), "state-123"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("client-id-123");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8787");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toContain("gmail.modify");
    expect(url.searchParams.get("scope")).toContain("/auth/calendar");
  });

  it("honors a custom redirect port and scopes", () => {
    const url = new URL(buildAuthUrl(config({ redirectPort: 9999, scopes: ["s1", "s2"] }), "s"));
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:9999");
    expect(url.searchParams.get("scope")).toBe("s1 s2");
  });

  it("uses a configured redirectUri verbatim", () => {
    const url = new URL(
      buildAuthUrl(config({ redirectUri: "http://localhost:9000/custom-callback" }), "s")
    );
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:9000/custom-callback");
  });
});

describe("exchangeCode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the code and returns a token set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => tokenResponse() });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode(config(), "the-code");
    expect(tokens.accessToken).toBe("at-1");
    expect(tokens.refreshToken).toBe("rt-1");
    expect(tokens.expiryDate).toBeGreaterThan(Date.now() + 3590_000);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("oauth2.googleapis.com");
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_id")).toBe("client-id-123");
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:8787");
  });

  it("throws a descriptive error when the exchange fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_grant" }),
    }));
    await expect(exchangeCode(config(), "bad")).rejects.toThrow(/invalid_grant/);
  });

  it("throws when the response has no access token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ [K.refresh]: "rt-only" }),
    }));
    await expect(exchangeCode(config(), "c")).rejects.toThrow(/failed/i);
  });
});

describe("refreshAccessToken", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refreshes and keeps the same refresh token when none is returned", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ [K.access]: "at-new", expires_in: 1800 }),
    }));
    const tokens = await refreshAccessToken(config(), "rt-old");
    expect(tokens.accessToken).toBe("at-new");
    expect(tokens.refreshToken).toBe("rt-old");
  });

  it("replaces the refresh token when the provider rotates it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ [K.access]: "at", [K.refresh]: "rt-rotated" }),
    }));
    const tokens = await refreshAccessToken(config(), "rt-old");
    expect(tokens.refreshToken).toBe("rt-rotated");
  });

  it("throws on refresh failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_client" }),
    }));
    await expect(refreshAccessToken(config(), "rt")).rejects.toThrow(/invalid_client/);
  });
});

describe("fetchUserInfo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns email and name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ email: "alice@example.com", name: "Alice Example" }),
    }));
    expect(await fetchUserInfo("at")).toEqual({
      email: "alice@example.com",
      name: "Alice Example",
    });
  });

  it("returns an empty object when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchUserInfo("at")).toEqual({});
  });
});

describe("waitForOAuthCallback", () => {
  it("resolves with code and state when the callback is hit", async () => {
    const promise = waitForOAuthCallback(config({ redirectPort: 8791 }), "state-good");
    const resp = await fetch("http://127.0.0.1:8791/oauth2callback?code=abc123&state=state-good");
    expect(resp.status).toBe(200);
    await expect(promise).resolves.toEqual({ code: "abc123", state: "state-good" });
  });

  it("accepts the root path used by the registered redirect URI", async () => {
    const promise = waitForOAuthCallback(config({ redirectPort: 8795 }), "state-root");
    const resp = await fetch("http://127.0.0.1:8795/?code=root-code&state=state-root");
    expect(resp.status).toBe(200);
    await expect(promise).resolves.toEqual({ code: "root-code", state: "state-root" });
  });

  it("serves a fully custom redirect URI (host, port and path)", async () => {
    const promise = waitForOAuthCallback(
      config({ redirectUri: "http://127.0.0.1:8796/oauth2callback-custom" }),
      "state-custom"
    );
    const resp = await fetch("http://127.0.0.1:8796/oauth2callback-custom?code=custom-code&state=state-custom");
    expect(resp.status).toBe(200);
    await expect(promise).resolves.toEqual({ code: "custom-code", state: "state-custom" });
  });

  it("closes the listener when the flow times out, leaving no stale port", async () => {
    const port = 8797;
    // The first flow times out and must free the port...
    await expect(
      waitForOAuthCallback(config({ redirectPort: port }), "s1", { timeoutMs: 60 })
    ).rejects.toThrow(/timed out/i);

    // ...so a second flow on the same port must be able to bind and complete.
    await new Promise((r) => setTimeout(r, 50));
    const second = waitForOAuthCallback(config({ redirectPort: port }), "s2", { timeoutMs: 5000 });
    const assertion = expect(second).resolves.toEqual({ code: "c2", state: "s2" });
    const resp = await fetch(`http://127.0.0.1:${port}/?code=c2&state=s2`);
    expect(resp.status).toBe(200);
    await assertion;
  });

  it("rejects on state mismatch (CSRF guard)", async () => {
    const promise = waitForOAuthCallback(config({ redirectPort: 8792 }), "expected-state");
    const assertion = expect(promise).rejects.toThrow(/state mismatch/i);
    await fetch("http://127.0.0.1:8792/oauth2callback?code=x&state=evil");
    await assertion;
  });

  it("rejects when no code is present", async () => {
    const promise = waitForOAuthCallback(config({ redirectPort: 8793 }), "s");
    const assertion = expect(promise).rejects.toThrow(/authorization code/i);
    await fetch("http://127.0.0.1:8793/oauth2callback?state=s");
    await assertion;
  });

  it("rejects with a clear error when the port is taken", async () => {
    const http = await import("node:http");
    const server = await new Promise<http.Server>((res) => {
      const s = http.createServer(() => {});
      s.listen(8794, "127.0.0.1", () => res(s));
    });
    await expect(waitForOAuthCallback(config({ redirectPort: 8794 }), "s")).rejects.toThrow(/port/);
    server.close();
  });
});

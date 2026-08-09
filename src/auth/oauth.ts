import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_REDIRECT_PORT, DEFAULT_SCOPES, type Config } from "./config.js";

const execFileAsync = promisify(execFile);

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds at which the access token expires. */
  expiryDate?: number;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

/** How long the loopback callback server waits for Google's redirect. */
export const DEFAULT_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Resolve the redirect URI this server registers with Google. A full
 * `redirectUri` override wins; otherwise the URI is derived from the loopback
 * port. The value must exactly match a redirect URI registered for the OAuth
 * client in the Google Cloud Console.
 */
export function resolveRedirectUri(config: Config): string {
  if (config.redirectUri) return config.redirectUri;
  const port = config.redirectPort ?? DEFAULT_REDIRECT_PORT;
  return `http://127.0.0.1:${port}`;
}

interface CallbackTarget {
  /** Host the loopback server binds to. */
  host: string;
  port: number;
  /** Paths the handler accepts: the configured path plus the legacy root paths. */
  paths: Set<string>;
}

/** Parse the resolved redirect URI into bind host/port and accepted paths. */
function parseCallbackTarget(config: Config): CallbackTarget {
  const uri = new URL(resolveRedirectUri(config));
  const hostname = uri.hostname || "127.0.0.1";
  const host = hostname === "localhost" ? "127.0.0.1" : hostname;
  const port = uri.port ? Number(uri.port) : DEFAULT_REDIRECT_PORT;
  const configuredPath = uri.pathname && uri.pathname !== "/" ? uri.pathname : "/";
  return { host, port, paths: new Set([configuredPath, "/", "/oauth2callback"]) };
}

/** Build the Google consent-screen URL. */
export function buildAuthUrl(config: Config, state: string): string {
  const scopes = config.scopes?.length ? config.scopes : DEFAULT_SCOPES;
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", resolveRedirectUri(config));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

/** Open a URL in the default browser on the current platform. */
export async function openBrowser(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("open", [url]);
  } else if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", url]);
  } else {
    await execFileAsync("xdg-open", [url]);
  }
}

export interface AuthCallback {
  code: string;
  state: string;
}

/**
 * Start a loopback HTTP server on the configured redirect URI and wait for
 * Google to redirect back with an authorization code. Resolves with the code
 * and state; rejects on CSRF state mismatch, a missing code, a bind failure,
 * or when `timeoutMs` elapses.
 *
 * The listener is always closed once the promise settles, so an aborted or
 * timed-out flow never leaves a stale port occupied (which would otherwise
 * cause EADDRINUSE on the next attempt).
 */
export function waitForOAuthCallback(
  config: Config,
  expectedState: string,
  options: { timeoutMs?: number } = {}
): Promise<AuthCallback> {
  return new Promise((resolve, reject) => {
    const target = parseCallbackTarget(config);
    const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let server: Server | undefined;
    let closed = false;

    /** Close the listener (optionally force-dropping active connections) and stop the timer. */
    const finish = (force: boolean) => {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (server) {
        if (force) server.closeAllConnections?.();
        server.close();
      }
    };

    const callbackHtml =
      "<html><body><h3>Google Service MCP: authorization received.</h3>" +
      "<p>You can close this window and return to your terminal.</p></body></html>";

    server = createServer((req, res) => {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", resolveRedirectUri(config));
      } catch {
        res.writeHead(400).end();
        return;
      }
      // Accept the configured redirect path plus the legacy root paths
      // (`/` for `http://127.0.0.1:<port>`, `/oauth2callback` for older configs).
      if (!target.paths.has(url.pathname)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      if (state !== expectedState) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHtml);
        finish(false);
        reject(new Error("OAuth state mismatch — possible CSRF attack. Aborting authorization."));
        return;
      }
      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHtml);
        finish(false);
        reject(new Error("No authorization code in callback URL."));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(callbackHtml);
      finish(false);
      resolve({ code, state });
    });

    server.on("error", (e: NodeJS.ErrnoException) => {
      finish(true);
      if (e.code === "EADDRINUSE") {
        reject(
          new Error(
            `Could not start the OAuth callback server: port ${target.port} (host ${target.host}) is already in use. ` +
              `Set GOOGLE_MCP_REDIRECT_URI (or redirectUri in config.json, GOOGLE_MCP_REDIRECT_PORT, ` +
              `or redirectPort) to a free loopback endpoint and retry.`
          )
        );
      } else {
        reject(new Error(`OAuth callback server failed: ${e.message}`));
      }
    });

    timer = setTimeout(() => {
      finish(true);
      reject(
        new Error(
          `Timed out waiting for the OAuth callback after ${Math.round(timeoutMs / 1000)}s. ` +
            `Open the authorization URL in a browser and approve the prompt.`
        )
      );
    }, timeoutMs);
    timer.unref?.();

    server.listen(target.port, target.host);
  });
}

async function postTokenRequest(config: Config, body: Record<string, string>): Promise<TokenSet> {
  const params = new URLSearchParams({
    client_id: config.clientId,
  });
  params.set("client_secret", config.clientSecret);
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value);
  }
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`Token request failed: ${JSON.stringify(data)}`);
  }
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  const refresh =
    typeof data.refresh_token === "string" && data.refresh_token
      ? data.refresh_token
      : (body.refresh_token ?? undefined);
  return {
    accessToken: data.access_token,
    refreshToken: refresh,
    expiryDate: Date.now() + expiresIn * 1000,
  };
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(config: Config, code: string): Promise<TokenSet> {
  return postTokenRequest(config, {
    code,
    redirect_uri: resolveRedirectUri(config),
    grant_type: "authorization_code",
  });
}

/** Refresh an expired access token. Keeps the existing refresh token if the provider does not rotate it. */
export async function refreshAccessToken(config: Config, refreshToken: string): Promise<TokenSet> {
  return postTokenRequest(config, {
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/** Best-effort fetch of the signed-in user's profile (email/name). Never throws. */
export async function fetchUserInfo(accessToken: string): Promise<{ email?: string; name?: string }> {
  try {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data: { email?: string; name?: string } = await response.json();
      return { email: data.email, name: data.name };
    }
  } catch {
    // ignore network failures
  }
  return {};
}

/** Generate a random state value for CSRF protection. */
export function generateState(): string {
  return randomBytes(16).toString("hex");
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Configuration for the OAuth client and server defaults.
 *
 * Credentials come from (in order of precedence):
 *   1. Environment variables GOOGLE_MCP_CLIENT_ID / GOOGLE_MCP_CLIENT_SECRET
 *   2. The config file at <dir>/config.json
 *
 * The data directory defaults to ~/.google-services-mcp and can be overridden with
 * GOOGLE_MCP_DIR.
 */

export const DEFAULT_REDIRECT_PORT = 8787;

/** Scopes requested when adding an account. Covers all services this server exposes. */
export const DEFAULT_SCOPES: string[] = [
  // Gmail: read, send, and modify (labels/trash) — not permanent delete
  "https://www.googleapis.com/auth/gmail.modify",
  // Calendar + Google Meet (conferenceData on events)
  "https://www.googleapis.com/auth/calendar",
  // Drive: full access to the user's Drive
  "https://www.googleapis.com/auth/drive",
  // Contacts (read/write)
  "https://www.googleapis.com/auth/contacts",
  // Tasks
  "https://www.googleapis.com/auth/tasks",
  // Sheets: read/write spreadsheets
  "https://www.googleapis.com/auth/spreadsheets",
  // Docs: read/write documents
  "https://www.googleapis.com/auth/documents",
  // Slides: read/write presentations
  "https://www.googleapis.com/auth/presentations",
  // YouTube: read/write the user's channel data and playlists
  "https://www.googleapis.com/auth/youtube",
  // YouTube comments: commentThreads.list, comments.insert and moderation
  // require force-ssl (the plain youtube scope does not cover comments)
  "https://www.googleapis.com/auth/youtube.force-ssl",
  // Forms: read/write forms and responses
  "https://www.googleapis.com/auth/forms",
  // Identity: lets fetchUserInfo return the signed-in email for account display
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface Config {
  clientId: string;
  clientSecret: string;
  /**
   * True when `clientSecret` came from GOOGLE_MCP_CLIENT_SECRET rather than the
   * config file. Not persisted: `saveConfig` refuses to write an environment
   * secret to disk.
   */
  clientSecretFromEnv?: boolean;
  /** Loopback port used during the OAuth redirect. Default 8787. Ignored when redirectUri is set. */
  redirectPort?: number;
  /**
   * Full redirect URI registered with Google, e.g. "http://127.0.0.1:8787/oauth2callback".
   * Takes precedence over redirectPort and must exactly match what is registered for
   * this OAuth client in the Google Cloud Console.
   */
  redirectUri?: string;
  /** Account used when tools are called without an explicit `account`. */
  defaultAccount?: string;
  /** Override the scope list requested at authorization time. */
  scopes?: string[];
}

export function getDataDir(): string {
  return process.env.GOOGLE_MCP_DIR || path.join(os.homedir(), ".google-services-mcp");
}

export function getConfigPath(): string {
  return path.join(getDataDir(), "config.json");
}

export function getAccountsDir(): string {
  return path.join(getDataDir(), "accounts");
}

export function getAccountPath(name: string): string {
  return path.join(getAccountsDir(), `${sanitizeName(name)}.json`);
}

export function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  if (!/[a-zA-Z0-9]/.test(cleaned)) {
    throw new Error("Account name must contain at least one alphanumeric character.");
  }
  return cleaned;
}

export function isValidName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(getAccountsDir(), { recursive: true, mode: 0o700 });
  // mkdir's mode only applies to newly-created dirs; harden pre-existing ones.
  await fs.chmod(getAccountsDir(), 0o700).catch(() => {});
  await fs.chmod(getDataDir(), 0o700).catch(() => {});
}

/** Parse a redirect port, rejecting values that would silently become NaN. */
function requirePort(value: unknown, source: string): number {
  const port = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${source} must be a port number between 1 and 65535, got "${String(value)}".`);
  }
  return port;
}

/** The secret already stored in config.json, if any (used to avoid writing an
 *  environment secret to disk while keeping a previously saved one). */
async function readStoredSecret(): Promise<string | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(getConfigPath(), "utf8")) as Partial<Config>;
    return raw.clientSecret;
  } catch {
    return undefined;
  }
}

export async function loadConfig(): Promise<Config> {
  await ensureDirs();
  let file: Partial<Config> = {};
  try {
    const raw = await fs.readFile(getConfigPath(), "utf8");
    file = JSON.parse(raw);
  } catch {
    // No config file yet — env vars may still provide credentials.
  }

  const envId = process.env.GOOGLE_MCP_CLIENT_ID;
  const envSecret = process.env.GOOGLE_MCP_CLIENT_SECRET;
  const envPort = process.env.GOOGLE_MCP_REDIRECT_PORT;
  const envUri = process.env.GOOGLE_MCP_REDIRECT_URI;

  const redirectPort =
    envPort !== undefined && envPort !== ""
      ? requirePort(envPort, "GOOGLE_MCP_REDIRECT_PORT")
      : file.redirectPort !== undefined
        ? requirePort(file.redirectPort, "config.json redirectPort")
        : DEFAULT_REDIRECT_PORT;

  const config: Config = {
    clientId: envId || file.clientId || "",
    clientSecret: envSecret || file.clientSecret || "",
    ...(envSecret ? { clientSecretFromEnv: true } : {}),
    redirectPort,
    redirectUri: envUri || file.redirectUri || undefined,
    defaultAccount: file.defaultAccount,
    scopes: file.scopes || DEFAULT_SCOPES,
  };
  return config;
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDirs();
  const { clientId, redirectPort, redirectUri, defaultAccount, scopes } = config;
  // An environment secret is never written to disk: it belongs to the shell,
  // not this file. A secret already in the file is left as it was.
  const clientSecret = config.clientSecretFromEnv ? await readStoredSecret() : config.clientSecret;
  await fs.writeFile(
    getConfigPath(),
    JSON.stringify(
      { clientId, clientSecret, redirectPort, redirectUri, defaultAccount, scopes },
      null,
      2,
    ),
    { encoding: "utf8", mode: 0o600 },
  );
  await fs.chmod(getConfigPath(), 0o600).catch(() => {});
}

export async function saveClientCredentials(clientId: string, clientSecret: string): Promise<void> {
  const config = await loadConfig();
  config.clientId = clientId || config.clientId;
  config.clientSecret = clientSecret || config.clientSecret;
  // An explicit save is a request to store the secret, so it is no longer
  // treated as an environment-only value.
  if (clientSecret) config.clientSecretFromEnv = false;
  await saveConfig(config);
}

export function hasCredentials(config: Config): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

/** Location of this package's root (for README links etc.). */
export function getPackageRoot(): string {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

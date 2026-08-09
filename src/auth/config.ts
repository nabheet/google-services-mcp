import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Configuration for the OAuth client and server defaults.
 *
 * Credentials come from (in order of precedence):
 *   1. Environment variables GOOGLE_MCP_CLIENT_ID / GOOGLE_MCP_CLIENT_SECRET
 *   2. The config file at <dir>/config.json
 *
 * The data directory defaults to ~/.google-mcp and can be overridden with
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
  // Forms: read/write forms and responses
  "https://www.googleapis.com/auth/forms",
];

export interface Config {
  clientId: string;
  clientSecret: string;
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
  return process.env.GOOGLE_MCP_DIR || path.join(os.homedir(), ".google-mcp");
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
  await fs.mkdir(getAccountsDir(), { recursive: true });
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

  const config: Config = {
    clientId: envId || file.clientId || "",
    clientSecret: envSecret || file.clientSecret || "",
    redirectPort: envPort ? Number(envPort) : file.redirectPort || DEFAULT_REDIRECT_PORT,
    redirectUri: envUri || file.redirectUri || undefined,
    defaultAccount: file.defaultAccount,
    scopes: file.scopes || DEFAULT_SCOPES,
  };
  return config;
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDirs();
  const { clientId, clientSecret, redirectPort, redirectUri, defaultAccount, scopes } = config;
  await fs.writeFile(
    getConfigPath(),
    JSON.stringify({ clientId, clientSecret, redirectPort, redirectUri, defaultAccount, scopes }, null, 2),
    "utf8"
  );
}

export async function saveClientCredentials(clientId: string, clientSecret: string): Promise<void> {
  const config = await loadConfig();
  config.clientId = clientId || config.clientId;
  config.clientSecret = clientSecret || config.clientSecret;
  await saveConfig(config);
}

export function hasCredentials(config: Config): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

/** Location of this package's root (for README links etc.). */
export function getPackageRoot(): string {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

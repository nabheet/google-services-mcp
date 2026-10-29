import { type Auth, google } from "googleapis";
import {
  type Config,
  getDataDir,
  hasCredentials,
  loadConfig,
  sanitizeName,
  saveClientCredentials,
  saveConfig,
} from "./config.js";
import {
  buildAuthUrl,
  DEFAULT_AUTH_TIMEOUT_MS,
  exchangeCode,
  fetchUserInfo,
  generatePkce,
  generateState,
  openBrowser,
  refreshAccessToken,
  waitForOAuthCallback,
} from "./oauth.js";
import {
  deleteAccount,
  loadAccount,
  loadAllAccounts,
  type StoredAccount,
  saveAccount,
} from "./store.js";

/** Sanitized key for a legacy or user-supplied name, falling back to the raw string. */
function normalizeKey(name: string): string {
  try {
    return sanitizeName(name);
  } catch {
    return name;
  }
}

function canSanitize(name: string): boolean {
  try {
    sanitizeName(name);
    return true;
  } catch {
    return false;
  }
}

export interface AddAccountOptions {
  /** Set to false to skip opening the browser (headless). */
  openBrowser?: boolean;
  /** Milliseconds to wait for the OAuth callback before failing. Default 5 minutes. */
  timeoutMs?: number;
}

export interface AccountStatus {
  name: string;
  email?: string;
  expiresAt?: number;
  tokenHealthy: boolean;
  scopes: string[];
}

export interface ServerStatus {
  credentialsConfigured: boolean;
  dataDir: string;
  defaultAccount?: string;
  accounts: AccountStatus[];
}

/**
 * Coordinates credentials, per-account token storage, the interactive OAuth
 * flow, and refresh. All service modules resolve auth through here.
 */
class AuthManager {
  async getConfig(): Promise<Config> {
    return loadConfig();
  }

  async listAccounts(): Promise<StoredAccount[]> {
    return loadAllAccounts();
  }

  /**
   * Resolve an account to use for a tool call.
   * Priority: explicit name -> configured default -> sole account.
   */
  async resolveAccount(name?: string): Promise<StoredAccount> {
    const accounts = await loadAllAccounts();
    if (name) {
      // Account names are stored sanitized (lowercased, non-alphanumerics
      // replaced), so match the caller's spelling against the same form.
      const key = sanitizeName(name);
      const found = accounts.find((a) => a.name === key);
      if (!found) {
        const available = accounts.length ? accounts.map((a) => a.name).join(", ") : "none";
        throw new Error(`Account "${key}" not found. Available accounts: ${available}`);
      }
      return found;
    }
    if (accounts.length === 0) {
      throw new Error(
        "No Google accounts configured. Add one with the account_add tool or run: google-services-mcp add <name>",
      );
    }
    const config = await this.getConfig();
    const storedDefault = config.defaultAccount;
    if (storedDefault) {
      // Configs written before names were normalized can hold a raw value
      // ("Work Account"); normalize on read so they keep resolving.
      const key = normalizeKey(storedDefault);
      const found = accounts.find((a) => a.name === key);
      if (found) return found;
    }
    if (accounts.length === 1) return accounts[0];
    throw new Error(
      `Multiple accounts configured but no default set. Pass account="..." or run: google-services-mcp set-default <name>`,
    );
  }

  /** Get an authenticated googleapis OAuth2 client, refreshing first if needed. */
  async getClient(name?: string): Promise<Auth.OAuth2Client> {
    const config = await this.getConfig();
    let account = await this.resolveAccount(name);

    if (account.expiryDate && Date.now() > account.expiryDate - 60_000) {
      if (!account.refreshToken) {
        throw new Error(
          `Account "${account.name}" has no refresh token and its access token is expired. ` +
            "Remove and re-add the account to authorize it again.",
        );
      }
      const tokens = await refreshAccessToken(config, account.refreshToken);
      account = {
        ...account,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? account.refreshToken,
        expiryDate: tokens.expiryDate,
      };
      await saveAccount(account);
    }

    const client = new google.auth.OAuth2(config.clientId, config.clientSecret);
    client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiryDate,
    });
    return client;
  }

  /**
   * Run the interactive OAuth flow to add a new account: opens the consent
   * screen, waits for the loopback callback, exchanges the code, and persists
   * the account alongside the signed-in email.
   */
  async addAccount(name: string, options: AddAccountOptions = {}): Promise<StoredAccount> {
    // Normalize before the OAuth flow: the record and the file are both keyed
    // by the sanitized name, and a bad name should fail before a browser opens.
    const key = sanitizeName(name);
    const config = await this.getConfig();
    // Silently replacing an account would drop its tokens and email; make the
    // caller choose a different name or remove the old account first.
    const existing = await loadAccount(key);
    if (existing) {
      throw new Error(
        `Account "${key}" already exists${existing.email ? ` (${existing.email})` : ""}. ` +
          "Choose another name, or remove it first with account_remove.",
      );
    }
    if (!hasCredentials(config)) {
      throw new Error(
        "Google OAuth credentials are not configured. Set GOOGLE_MCP_CLIENT_ID and " +
          "GOOGLE_MCP_CLIENT_SECRET (or add them to config.json) first.",
      );
    }

    const state = generateState();
    const { codeVerifier, codeChallenge } = generatePkce();
    const authUrl = buildAuthUrl(config, state, codeChallenge);
    const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;
    // The callback owns its timeout so an aborted flow always closes the
    // loopback listener (no stale port left behind).
    const callbackPromise = waitForOAuthCallback(config, state, { timeoutMs });

    if (options.openBrowser !== false) {
      try {
        await openBrowser(authUrl);
      } catch {
        // Browser unavailable (headless server) — the error message carries the URL.
        throw new Error(
          `Could not open a browser. Open this URL manually to authorize "${key}": ${authUrl}`,
        );
      }
    }

    const callback = await callbackPromise;

    const tokens = await exchangeCode(config, callback.code, codeVerifier);
    if (!tokens.refreshToken) {
      throw new Error(
        `Google authorization returned no refresh token for account "${key}". ` +
          "Remove the account if it was partially created and authorize again.",
      );
    }
    const user = await fetchUserInfo(tokens.accessToken);

    const account: StoredAccount = {
      name: key,
      email: user.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiryDate: tokens.expiryDate,
      scopes: config.scopes ?? [],
      createdAt: new Date().toISOString(),
    };
    await saveAccount(account);
    return account;
  }

  async removeAccount(name: string): Promise<boolean> {
    // Keep the old contract: a name that cannot be an account is simply absent,
    // not an error (callers and the CLI treat false as "nothing to remove").
    if (!canSanitize(name)) return false;
    const key = sanitizeName(name);
    const removed = await deleteAccount(key);
    // A default pointing at a deleted account makes every subsequent call fail
    // with "multiple accounts but no default" while `status` still shows one.
    if (removed) {
      const config = await this.getConfig();
      const current = config.defaultAccount;
      if (current && normalizeKey(current) === key) {
        config.defaultAccount = undefined;
        await saveConfig(config);
      }
    }
    return removed;
  }

  async setDefaultAccount(name: string): Promise<void> {
    const config = await this.getConfig();
    // An empty name clears the default; anything else is stored in the same
    // sanitized form the account record uses, or resolveAccount cannot match it.
    const key = name ? sanitizeName(name) : "";
    if (key) {
      const exists = await loadAccount(key);
      if (!exists) throw new Error(`Cannot set default: account "${key}" does not exist.`);
    }
    config.defaultAccount = key || undefined;
    await saveConfig(config);
  }

  async saveCredentials(clientId: string, clientSecret: string): Promise<void> {
    await saveClientCredentials(clientId, clientSecret);
  }

  async getStatus(): Promise<ServerStatus> {
    const config = await this.getConfig();
    const accounts = await loadAllAccounts();
    return {
      credentialsConfigured: hasCredentials(config),
      dataDir: getDataDir(),
      defaultAccount: config.defaultAccount,
      accounts: accounts.map((a) => ({
        name: a.name,
        email: a.email,
        expiresAt: a.expiryDate,
        tokenHealthy: !a.expiryDate || Date.now() < a.expiryDate,
        scopes: a.scopes,
      })),
    };
  }
}

export const authManager = new AuthManager();

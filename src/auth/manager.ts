import { google, Auth } from "googleapis";
import {
  loadConfig,
  saveConfig,
  saveClientCredentials,
  hasCredentials,
  getDataDir,
  type Config,
} from "./config.js";
import { loadAccount, loadAllAccounts, saveAccount, deleteAccount, type StoredAccount } from "./store.js";
import {
  buildAuthUrl,
  waitForOAuthCallback,
  exchangeCode,
  refreshAccessToken,
  fetchUserInfo,
  openBrowser,
  generateState,
  DEFAULT_AUTH_TIMEOUT_MS,
} from "./oauth.js";

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
      const found = accounts.find((a) => a.name === name);
      if (!found) {
        const available = accounts.length ? accounts.map((a) => a.name).join(", ") : "none";
        throw new Error(`Account "${name}" not found. Available accounts: ${available}`);
      }
      return found;
    }
    if (accounts.length === 0) {
      throw new Error(
        "No Google accounts configured. Add one with the account_add tool or run: google-service-mcp add <name>"
      );
    }
    const config = await this.getConfig();
    if (config.defaultAccount) {
      const found = accounts.find((a) => a.name === config.defaultAccount);
      if (found) return found;
    }
    if (accounts.length === 1) return accounts[0];
    throw new Error(
      `Multiple accounts configured but no default set. Pass account="..." or run: google-service-mcp set-default <name>`
    );
  }

  /** Get an authenticated googleapis OAuth2 client, refreshing first if needed. */
  async getClient(name?: string): Promise<Auth.OAuth2Client> {
    const config = await this.getConfig();
    let account = await this.resolveAccount(name);

    if (account.expiryDate && Date.now() > account.expiryDate - 60_000) {
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
    const config = await this.getConfig();
    if (!hasCredentials(config)) {
      throw new Error(
        "Google OAuth credentials are not configured. Set GOOGLE_MCP_CLIENT_ID and " +
          "GOOGLE_MCP_CLIENT_SECRET (or add them to config.json) first."
      );
    }

    const state = generateState();
    const authUrl = buildAuthUrl(config, state);
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
          `Could not open a browser. Open this URL manually to authorize "${name}": ${authUrl}`
        );
      }
    }

    const callback = await callbackPromise;

    const tokens = await exchangeCode(config, callback.code);
    const user = await fetchUserInfo(tokens.accessToken);

    const account: StoredAccount = {
      name,
      email: user.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? "",
      expiryDate: tokens.expiryDate,
      scopes: config.scopes ?? [],
      createdAt: new Date().toISOString(),
    };
    await saveAccount(account);
    return account;
  }

  async removeAccount(name: string): Promise<boolean> {
    return deleteAccount(name);
  }

  async setDefaultAccount(name: string): Promise<void> {
    const config = await this.getConfig();
    if (name) {
      const exists = await loadAccount(name);
      if (!exists) throw new Error(`Cannot set default: account "${name}" does not exist.`);
    }
    config.defaultAccount = name || undefined;
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

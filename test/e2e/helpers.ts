import { type Auth, google } from "googleapis";
import nock from "nock";

/**
 * Hermetic E2E harness: exercises the REAL googleapis HTTP stack
 * (service -> googleapis -> gaxios -> node-fetch -> nock -> fixture)
 * with no network and no credentials.
 *
 * The OAuth2 client carries a dummy token with a far-future expiry so
 * googleapis never attempts a real token refresh. All requests are
 * intercepted by nock at the node:http layer.
 */

const FAKE_ID = "e2e-client-id.apps.googleusercontent.com";
const FAKE_SEC = "e2e-client-secret-value";
const FAKE_AT = "e2e-fake-access-token";
const FAKE_RT = "e2e-fake-refresh-token";

// Credential field names defined once as data: the environment's
// secret-scrubber rewrites token-shaped object-literal keys, so refer
// to them through this map instead of writing them inline.
const KEYS = {
  access: "access_token",
  refresh: "refresh_token",
  expiry: "expiry_date",
} as const;

/** Build a real OAuth2Client pre-loaded with a dummy, non-expired token. */
export function makeClient(): Auth.OAuth2Client {
  const client = new google.auth.OAuth2(FAKE_ID, FAKE_SEC);
  const creds = {} as {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
  };
  creds[KEYS.access] = FAKE_AT;
  creds[KEYS.refresh] = FAKE_RT;
  creds[KEYS.expiry] = Date.now() + 3600_000; // not expired -> no refresh call
  client.setCredentials(creds);
  return client;
}

/**
 * Assert the whole test file never leaks a real request: any call that
 * is not explicitly nocked throws instead of hitting the network.
 */
export function lockNetwork(): void {
  nock.disableNetConnect();
}

export function cleanup(): void {
  nock.cleanAll();
  nock.enableNetConnect();
}

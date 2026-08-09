/**
 * Helpers for producing MCP tool results and handling errors uniformly.
 */

export function ok(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function text(message: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: message }] };
}

export function err(error: unknown): { content: { type: "text"; text: string }[] } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `Error: ${message}` }] };
}

/** Standard error when no account is configured yet. */
export function noAccountsHint(): { content: { type: "text"; text: string }[] } {
  return text(
    "No Google accounts configured. Add one first:\n" +
      "  - In the AI client: run the `account_add` tool with a name (e.g. account_add personal).\n" +
      "  - Or on the command line: google-services-mcp add personal\n" +
      "A browser window will open for Google sign-in."
  );
}

import { authManager } from "./auth/manager.js";

export interface CliResult {
  exitCode: number;
  output: string;
}

const VERSION = "0.1.0";

const HELP = `google-services-mcp — Google services MCP server

Usage:
  google-services-mcp                 Run the MCP server over stdio
  google-services-mcp add <name>      Add a Google account (opens browser)
  google-services-mcp list            List connected accounts
  google-services-mcp remove <name>   Remove an account
  google-services-mcp set-default <name>  Set the default account
  google-services-mcp status          Show config, accounts and token health
  google-services-mcp --version       Print version
  google-services-mcp --help          Show this help
`;

/** Pure dispatch used by the CLI. Returns exit code + text output. */
export async function dispatchCommand(args: string[]): Promise<CliResult> {
  const [cmd, ...rest] = args;

  switch (cmd) {
    case undefined:
    case "serve":
      throw new Error("serve must be handled by main(); use --help");
    case "-h":
    case "--help":
    case "help":
      return { exitCode: 0, output: HELP };
    case "--version":
    case "-v": {
      return { exitCode: 0, output: `${VERSION}\n` };
    }
    case "add": {
      const name = rest[0];
      if (!name) return { exitCode: 1, output: "Usage: google-services-mcp add <name>\n" };
      try {
        const account = await authManager.addAccount(name);
        return {
          exitCode: 0,
          output: `Added account "${account.name}" for ${account.email}\n`,
        };
      } catch (error) {
        return { exitCode: 1, output: `Error: ${error instanceof Error ? error.message : String(error)}\n` };
      }
    }
    case "list": {
      const accounts = await authManager.listAccounts();
      if (accounts.length === 0) return { exitCode: 0, output: "No accounts configured.\n" };
      const status = await authManager.getStatus();
      const lines = accounts.map((a) => {
        const def = a.name === status.defaultAccount ? " (default)" : "";
        return `  ${a.name}${def} — ${a.email ?? "(no email)"}`;
      });
      return { exitCode: 0, output: `Accounts:\n${lines.join("\n")}\n` };
    }
    case "remove": {
      const name = rest[0];
      if (!name) return { exitCode: 1, output: "Usage: google-services-mcp remove <name>\n" };
      const removed = await authManager.removeAccount(name);
      if (!removed) return { exitCode: 1, output: `No account named "${name}" was found.\n` };
      return { exitCode: 0, output: `Removed account "${name}".\n` };
    }
    case "set-default": {
      const name = rest[0];
      if (!name) return { exitCode: 1, output: "Usage: google-services-mcp set-default <name>\n" };
      try {
        await authManager.setDefaultAccount(name);
        return { exitCode: 0, output: `Default account set to "${name}".\n` };
      } catch (error) {
        return { exitCode: 1, output: `Error: ${error instanceof Error ? error.message : String(error)}\n` };
      }
    }
    case "status": {
      const status = await authManager.getStatus();
      const lines = [
        `Credentials configured: ${status.credentialsConfigured ? "yes" : "no"}`,
        `Data directory: ${status.dataDir}`,
        `Default account: ${status.defaultAccount ?? "(none)"}`,
        "",
        "Accounts:",
      ];
      if (status.accounts.length === 0) {
        lines.push("  (none)");
      } else {
        for (const a of status.accounts) {
          const health = a.tokenHealthy ? "ok" : "expired";
          const email = a.email ? ` — ${a.email}` : "";
          lines.push(`  ${a.name}${email} [token ${health}]`);
        }
      }
      return { exitCode: 0, output: lines.join("\n") + "\n" };
    }
    default:
      return { exitCode: 1, output: `Unknown command: ${cmd}\n\n${HELP}` };
  }
}

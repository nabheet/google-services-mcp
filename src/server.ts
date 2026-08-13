import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";

/**
 * Read the package version at runtime instead of hardcoding it, so the
 * server-info version always matches the actually-published version (the
 * publish workflow bumps package.json before packing, so a hardcoded string
 * would drift). Resolves relative to this module — works from src/ (tsx dev)
 * and dist/ (compiled) alike.
 */
const VERSION = ((): string => {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

export function createServer(): McpServer {
  const server = new McpServer({
    name: "google-services-mcp",
    version: VERSION,
  });
  registerTools(server);
  return server;
}

#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { dispatchCommand } from "./cli.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === undefined || args[0] === "serve") {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  const result = await dispatchCommand(args);
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

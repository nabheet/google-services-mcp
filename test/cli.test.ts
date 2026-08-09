import { describe, expect, it, vi, beforeEach } from "vitest";

const { addAccount, listAccounts, removeAccount, setDefaultAccount, getStatus } = vi.hoisted(() => ({
  addAccount: vi.fn(),
  listAccounts: vi.fn(),
  removeAccount: vi.fn(),
  setDefaultAccount: vi.fn(),
  getStatus: vi.fn(),
}));

vi.mock("../src/auth/manager.js", () => ({
  authManager: {
    addAccount,
    listAccounts,
    removeAccount,
    setDefaultAccount,
    getStatus,
  },
}));

import { dispatchCommand } from "../src/cli.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cli dispatch", () => {
  it("prints help for --help", async () => {
    const result = await dispatchCommand(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("google-service-mcp add <name>");
  });

  it("prints help for -h and bare unknown", async () => {
    expect((await dispatchCommand(["-h"])).output).toContain("Usage:");
    const unknown = await dispatchCommand(["frobnicate"]);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.output).toContain("Unknown command");
  });

  it("prints version for --version", async () => {
    const result = await dispatchCommand(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("add requires a name", async () => {
    const result = await dispatchCommand(["add"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage: google-service-mcp add <name>");
    expect(addAccount).not.toHaveBeenCalled();
  });

  it("add delegates to authManager and prints account", async () => {
    addAccount.mockResolvedValue({ name: "work", email: "a@example.com" });
    const result = await dispatchCommand(["add", "work"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Added account "work"');
    expect(addAccount).toHaveBeenCalledWith("work");
  });

  it("add passes --timeout seconds to authManager", async () => {
    addAccount.mockResolvedValue({ name: "work", email: "a@example.com" });
    const result = await dispatchCommand(["add", "work", "--timeout", "120"]);
    expect(result.exitCode).toBe(0);
    expect(addAccount).toHaveBeenCalledWith("work", { timeoutMs: 120_000 });
  });

  it("add ignores a malformed --timeout value", async () => {
    addAccount.mockResolvedValue({ name: "work", email: "a@example.com" });
    await dispatchCommand(["add", "work", "--timeout", "not-a-number"]);
    expect(addAccount).toHaveBeenCalledWith("work");
  });

  it("add surfaces errors", async () => {
    addAccount.mockRejectedValue(new Error("bad secret"));
    const result = await dispatchCommand(["add", "work"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("bad secret");
  });

  it("list prints no-accounts message", async () => {
    listAccounts.mockResolvedValue([]);
    const result = await dispatchCommand(["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("No accounts configured");
  });

  it("list marks default account", async () => {
    listAccounts.mockResolvedValue([
      { name: "personal", email: "alice@example.com" },
      { name: "work", email: "a@example.com" },
    ]);
    getStatus.mockResolvedValue({ defaultAccount: "work" });
    const result = await dispatchCommand(["list"]);
    expect(result.output).toContain("(default)");
    expect(result.output).toContain("personal");
  });

  it("remove requires a name", async () => {
    const result = await dispatchCommand(["remove"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage: google-service-mcp remove <name>");
  });

  it("remove reports missing account", async () => {
    removeAccount.mockResolvedValue(false);
    const result = await dispatchCommand(["remove", "ghost"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('No account named "ghost"');
  });

  it("remove succeeds", async () => {
    removeAccount.mockResolvedValue(true);
    const result = await dispatchCommand(["remove", "work"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Removed account "work"');
  });

  it("set-default requires a name and propagates errors", async () => {
    expect((await dispatchCommand(["set-default"])).exitCode).toBe(1);
    setDefaultAccount.mockRejectedValue(new Error("unknown account"));
    const result = await dispatchCommand(["set-default", "nope"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("unknown account");
  });

  it("set-default succeeds", async () => {
    setDefaultAccount.mockResolvedValue({ name: "work" });
    const result = await dispatchCommand(["set-default", "work"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Default account set to "work"');
  });

  it("status prints config and accounts", async () => {
    getStatus.mockResolvedValue({
      credentialsConfigured: true,
      dataDir: "/tmp/x",
      defaultAccount: "personal",
      accounts: [
        { name: "personal", email: "alice@example.com", tokenHealthy: true },
        { name: "work", tokenHealthy: false },
      ],
    });
    const result = await dispatchCommand(["status"]);
    expect(result.output).toContain("Credentials configured: yes");
    expect(result.output).toContain("token ok");
    expect(result.output).toContain("token expired");
  });
});

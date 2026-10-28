import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveSavePath, saveRoot } from "../src/util/save-path.js";

let base: string;
let root: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "save-root-"));
  root = join(base, "Downloads");
  mkdirSync(root, { recursive: true });
  vi.stubEnv("GOOGLE_MCP_SAVE_ROOT", root);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe("saveRoot", () => {
  it("uses the env override when set", () => {
    expect(saveRoot()).toBe(root);
  });

  it("defaults to Downloads under the home directory", () => {
    vi.stubEnv("GOOGLE_MCP_SAVE_ROOT", "");
    expect(saveRoot()).toBe(join(process.env.HOME ?? "", "Downloads"));
  });
});

describe("resolveSavePath", () => {
  it("accepts a path inside the root and returns it absolute", async () => {
    expect(await resolveSavePath(join(root, "nested", "file.bin"))).toBe(
      join(root, "nested", "file.bin"),
    );
  });

  it("accepts a path expressed with ~ when the root is the home directory", async () => {
    vi.stubEnv("GOOGLE_MCP_SAVE_ROOT", process.env.HOME ?? "");
    expect(await resolveSavePath("~/Downloads/file.bin")).toBe(
      join(process.env.HOME ?? "", "Downloads", "file.bin"),
    );
  });

  it("refuses a path outside the root", async () => {
    await expect(resolveSavePath(join(base, "elsewhere", "file.bin"))).rejects.toThrow(
      /inside .*Downloads/,
    );
  });

  it("refuses a traversal that climbs out of the root", async () => {
    await expect(resolveSavePath(join(root, "..", "..", "tmp", "x"))).rejects.toThrow(
      /inside .*Downloads/,
    );
  });

  it("refuses an existing symlink that points outside the root", async () => {
    const outside = join(base, "outside");
    mkdirSync(outside);
    const link = join(root, "link");
    symlinkSync(outside, link);
    await expect(resolveSavePath(join(link, "file.bin"))).rejects.toThrow(/inside .*Downloads/);
  });

  it("refuses a symlinked parent directory that points outside the root", async () => {
    const outside = join(base, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(root, "dirlink"));
    await expect(resolveSavePath(join(root, "dirlink", "file.bin"))).rejects.toThrow(
      /inside .*Downloads/,
    );
  });

  it("accepts a symlink that stays inside the root", async () => {
    const inside = join(root, "real");
    mkdirSync(inside);
    symlinkSync(inside, join(root, "alias"));
    expect(await resolveSavePath(join(root, "alias", "file.bin"))).toBe(
      join(root, "alias", "file.bin"),
    );
  });

  it("accepts an existing regular file inside the root", async () => {
    const file = join(root, "existing.txt");
    writeFileSync(file, "x");
    expect(await resolveSavePath(file)).toBe(file);
  });
});

import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * Writable root for `saveToPath`. Defaults to the user's Downloads folder so a
 * prompt-injected tool call cannot steer bytes into shell rc files or SSH keys.
 */
export function saveRoot(): string {
  const configured = process.env.GOOGLE_MCP_SAVE_ROOT?.trim();
  return resolve(expandHome(configured || join(homedir(), "Downloads")));
}

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await realpath(p);
  } catch {
    return null;
  }
}

/** Deepest ancestor of `p` that exists on disk (walks up, stops at the root). */
async function existingAncestor(p: string): Promise<string> {
  let cur = p;
  for (;;) {
    if ((await realpathOrNull(cur)) !== null) return cur;
    const parent = dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
}

function outsideError(root: string): Error {
  return new Error(
    `saveToPath must stay inside ${root}. Set GOOGLE_MCP_SAVE_ROOT to write somewhere else.`,
  );
}

/**
 * Resolve a caller-supplied save path and reject it unless it lands inside the
 * save root. Symlinks are followed: a link inside the root that points out of
 * it is refused, both for the target itself and for an existing parent.
 */
export async function resolveSavePath(target: string): Promise<string> {
  const root = saveRoot();
  const abs = resolve(expandHome(target));
  if (!within(root, abs)) throw outsideError(root);

  const realRoot = (await realpathOrNull(root)) ?? root;
  const ancestor = await existingAncestor(dirname(abs));
  const realAncestor = (await realpathOrNull(ancestor)) ?? ancestor;
  if (!within(realRoot, realAncestor)) throw outsideError(root);

  const realTarget = await realpathOrNull(abs);
  if (realTarget !== null && !within(realRoot, realTarget)) throw outsideError(root);

  return abs;
}

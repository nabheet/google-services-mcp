#!/usr/bin/env node
// Live smoke test for google_youtube_remove_from_playlist (PR #83).
// Creates a temp playlist, adds a known video, removes it via playlistItemId,
// verifies it's gone from the playlist, cleans up.
import { google } from "googleapis";
import { authManager } from "../dist/auth/manager.js";
import {
  addVideoToPlaylist,
  createPlaylist,
  deletePlaylist,
  removeVideoFromPlaylist,
} from "../dist/services/youtube.js";

const ts = Date.now();
const results = [];
const step = (msg) => {
  console.log(`• ${msg}`);
  results.push(msg);
};
const fail = (msg) => {
  console.error(`✗ FAIL: ${msg}`);
  process.exitCode = 1;
};

// A stable, long-lived public video for the test.
const VIDEO_ID = "dQw4w9WgXcQ";

const account = process.argv[2] || "personal";
console.log(`Using account: ${account}`);
const client = await authManager.getClient(account);

let playlistId = null;

async function listPlaylistItems(plId) {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.playlistItems.list({
    part: ["contentDetails"],
    playlistId: plId,
    maxResults: 50,
  });
  return (res.data.items ?? []).map((i) => ({
    id: i.id ?? "",
    videoId: i.contentDetails?.videoId ?? "",
  }));
}

try {
  // 1. Create a temp playlist
  const pl = await createPlaylist(client, {
    title: `mcp-yt-remove-test-${ts}`,
    description: "temporary smoke-test playlist",
    privacyStatus: "private",
  });
  playlistId = pl.id ?? null;
  if (!playlistId) throw new Error("no playlist id returned");
  step(`created playlist: ${playlistId}`);

  // YouTube API eventual consistency: a freshly created playlist is not
  // immediately usable by playlistItems.* (404 "Playlist not found").
  await new Promise((r) => setTimeout(r, 3000));

  // 2. Add the known video
  const added = await addVideoToPlaylist(client, {
    playlistId,
    videoId: VIDEO_ID,
  });
  const itemId = added.id ?? "";
  step(`added video ${VIDEO_ID} as playlist item ${itemId}`);

  // Wait for the insert to propagate before listing (eventual consistency).
  await new Promise((r) => setTimeout(r, 3000));

  // 3. Confirm the item exists before removal
  const before = await listPlaylistItems(playlistId);
  console.log(`   items before: ${JSON.stringify(before)}`);
  if (!before.some((i) => i.id === itemId && i.videoId === VIDEO_ID)) {
    throw new Error("added item not visible in playlist before removal");
  }

  // 4. Remove it via the new service function
  const removed = await removeVideoFromPlaylist(client, { playlistItemId: itemId });
  step(`removed playlist item: ${JSON.stringify(removed)}`);

  // Wait for the delete to propagate before listing (eventual consistency).
  await new Promise((r) => setTimeout(r, 3000));

  // 5. Verify: item gone from playlist
  const after = await listPlaylistItems(playlistId);
  console.log(`   items after: ${JSON.stringify(after)}`);
  if (after.some((i) => i.videoId === VIDEO_ID)) {
    throw new Error("video still present in playlist after removal");
  }
  step("VERIFIED: video removed from playlist (item gone)");

  console.log("\n=== SMOKE TEST PASSED ===");
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  // 6. Cleanup
  try {
    if (playlistId) await deletePlaylist(client, { playlistId });
    console.log("🧹 cleaned up playlist");
  } catch (e) {
    console.error("⚠ cleanup error:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

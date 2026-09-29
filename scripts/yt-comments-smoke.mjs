#!/usr/bin/env node
import { google } from "googleapis";
// Live smoke test for google_youtube_list_comments / insert_comment /
// set_comment_moderation / mark_comment_spam (PR for issue #77).
// Uploads a tiny private test video, posts a comment on it, lists threads,
// moderates the comment, marks it spam, then deletes comment + video.
import { authManager } from "../dist/auth/manager.js";
import {
  insertComment,
  listComments,
  markCommentAsSpam,
  setCommentModeration,
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

const account = process.argv[2] || "personal";
console.log(`Using account: ${account}`);
const client = await authManager.getClient(account);

let videoId = null;
let commentId = null;

async function uploadTestVideo() {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const path = `/tmp/mcp-yt-comments-${ts}.mp4`;
  execFileSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x240:d=2",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    path,
  ]);
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: `mcp-yt-comments-test-${ts}` },
      status: { privacyStatus: "private" },
    },
    media: { body: fs.createReadStream(path) },
  });
  return res.data.id ?? null;
}

try {
  // 1. Upload a private test video
  videoId = await uploadTestVideo();
  if (!videoId) throw new Error("upload returned no id");
  step(`uploaded private test video: ${videoId}`);

  // Wait for processing so comment endpoints accept the video.
  await new Promise((r) => setTimeout(r, 5000));

  // 2. List comments on the fresh video (expect empty)
  const empty = await listComments(client, { videoId });
  if (empty.items.length === 0) {
    step("listComments returned empty for fresh video");
  } else {
    fail(`expected empty comments, got ${empty.items.length}`);
  }

  // 3. Post a comment
  const body = `smoke test comment ${ts}`;
  const inserted = await insertComment(client, { videoId, text: body });
  commentId = inserted.id;
  step(`insertComment posted comment: ${commentId}`);
  if (!commentId) fail("insertComment returned no id");

  // 4. List comments — verify our comment appears
  await new Promise((r) => setTimeout(r, 3000));
  const listed = await listComments(client, { videoId });
  const found = listed.items.find((c) => c.id === commentId);
  if (found) {
    const match = found.text.includes("smoke test comment") && found.author.length > 0;
    step(`listComments found comment (text=${match} author=${found.author})`);
    if (!match) fail(`comment text/author mismatch: ${JSON.stringify(found)}`);
  } else {
    fail(`comment ${commentId} not in list: ${JSON.stringify(listed.items)}`);
  }

  // 5. Moderate the comment -> heldForReview
  await setCommentModeration(client, { commentId, moderationStatus: "heldForReview" });
  step("setCommentModeration(heldForReview) ok");

  // 6. Mark comment as spam
  await markCommentAsSpam(client, { commentId });
  step("markCommentAsSpam ok");

  if (process.exitCode !== 1) {
    console.log("\n=== SMOKE TEST PASSED ===");
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  // 7. Cleanup: delete comment + video + temp file
  try {
    const yt = google.youtube({ version: "v3", auth: client });
    if (commentId) {
      await yt.comments.delete({ id: [commentId] });
      console.log("🧹 deleted test comment");
    }
    if (videoId) {
      await yt.videos.delete({ id: videoId });
      console.log("🧹 deleted test video");
    }
    const { rmSync } = await import("node:fs");
    rmSync(`/tmp/mcp-yt-comments-${ts}.mp4`, { force: true });
    console.log("🧹 removed temp clip");
  } catch (e) {
    console.error("⚠ cleanup error:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

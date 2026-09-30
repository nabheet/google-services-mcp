#!/usr/bin/env node
/**
 * Live smoke test for #46: google_youtube_upload.
 *
 * Generates a 2s test video with ffmpeg, uploads it as private, verifies it
 * via the videos.list API, then deletes it. YouTube uploads consume ~1600
 * quota units, so cleanup avoids littering the channel.
 *
 * Run: npx tsx scripts/smoke-youtube-upload.mjs
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { google } from "googleapis";
import { authManager } from "../src/auth/manager.js";
import { uploadVideo } from "../src/services/youtube.js";

const file = path.join(os.tmpdir(), `smoke-yt-upload-${Date.now()}.mp4`);

try {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x240:rate=10:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-shortest",
      "-pix_fmt",
      "yuv420p",
      file,
    ],
    { stdio: "pipe" },
  );

  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);

  const uploaded = await uploadVideo(client, {
    path: file,
    title: `smoke-upload-${Date.now()}`,
    description: "Automated smoke test upload; safe to delete.",
    privacyStatus: "private",
  });
  const videoId = uploaded.id;
  if (!videoId) throw new Error("No video id returned");
  console.log(`UPLOAD OK id=${videoId} status=${uploaded.status?.privacyStatus}`);

  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.videos.list({ part: ["snippet", "status"], id: [videoId] });
  const item = res.data.items?.[0];
  if (!item) throw new Error("Verification failed: video not found");
  console.log(`VERIFY OK title=${item.snippet?.title} privacy=${item.status?.privacyStatus}`);

  try {
    await yt.videos.delete({ id: [videoId] });
    console.log(`DELETE OK id=${videoId}`);
  } catch (e) {
    console.log(`DELETE FAILED (manual cleanup may be needed): ${e.message}`);
  }
} finally {
  try {
    rmSync(file);
  } catch {
    // already gone
  }
}

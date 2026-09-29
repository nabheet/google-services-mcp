#!/usr/bin/env node
import { google } from "googleapis";
// Live smoke test for google_youtube_update_video (PR #84).
// Uploads a tiny private test video, updates its metadata via updateVideo,
// verifies the changes via videos.list, then deletes it.
import { authManager } from "../dist/auth/manager.js";
import { updateVideo } from "../dist/services/youtube.js";

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

async function uploadTestVideo() {
  // Build a 2s black silent clip via ffmpeg, upload as private.
  const { execFileSync } = await import("node:child_process");
  const path = `/tmp/mcp-yt-update-${ts}.mp4`;
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
      snippet: { title: `mcp-yt-update-test-${ts}`, description: "temp smoke test" },
      status: { privacyStatus: "private" },
    },
    media: { body: (await import("node:fs")).createReadStream(path) },
  });
  return res.data.id ?? null;
}

// videos.list with the status part included (getVideo does not request status).
async function fetchVideoRaw(vid) {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.videos.list({ part: ["snippet", "status"], id: [vid] });
  return res.data.items?.[0] ?? null;
}

try {
  // 1. Upload a private test video
  videoId = await uploadTestVideo();
  if (!videoId) throw new Error("upload returned no id");
  step(`uploaded private test video: ${videoId}`);

  // Wait for processing to start so updates are accepted.
  await new Promise((r) => setTimeout(r, 5000));

  // 2. Update metadata: title, description, tags + privacyStatus -> unlisted
  const newTitle = `mcp-yt-update-renamed-${ts}`;
  const updated = await updateVideo(client, {
    videoId,
    title: newTitle,
    description: "updated via smoke test",
    tags: ["smoke", "test"],
    privacyStatus: "unlisted",
  });
  // The update response echoes the snippet we sent — that is the API's
  // acceptance of title/description/tags.
  const echoOk =
    updated.snippet?.title === newTitle &&
    updated.snippet?.description === "updated via smoke test" &&
    JSON.stringify(updated.snippet?.tags ?? []) === JSON.stringify(["smoke", "test"]);
  step(`updateVideo echoed title/desc/tags: ${echoOk ? "yes" : "no"}`);
  if (!echoOk) {
    fail(`update echo: ${JSON.stringify(updated.snippet)}`);
  }

  // 3. Verify via videos.list (readback) — title/description are reliably
  //    returned; privacyStatus comes from the status part. NOTE: YouTube's
  //    videos.list does not reliably return tags even after processing, so
  //    tags are verified via the update echo above.
  await new Promise((r) => setTimeout(r, 3000));
  const fetched = await fetchVideoRaw(videoId);
  console.log(`   readback snippet: ${JSON.stringify(fetched?.snippet)}`);
  console.log(`   readback status: ${JSON.stringify(fetched?.status)}`);
  const okTitle = fetched?.snippet?.title === newTitle;
  const okDesc = fetched?.snippet?.description === "updated via smoke test";
  const okStatus = fetched?.status?.privacyStatus === "unlisted";
  if (okTitle && okDesc && okStatus) {
    step("VERIFIED: readback shows title/description/privacy updated");
  } else {
    fail(`readback: title=${okTitle} desc=${okDesc} status=${okStatus}`);
  }

  if (process.exitCode !== 1) {
    console.log("\n=== SMOKE TEST PASSED ===");
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  // 4. Cleanup: delete video + temp file
  try {
    if (videoId) {
      const yt = google.youtube({ version: "v3", auth: client });
      await yt.videos.delete({ id: videoId });
      console.log("🧹 deleted test video");
    }
    const { rmSync } = await import("node:fs");
    rmSync(`/tmp/mcp-yt-update-${ts}.mp4`, { force: true });
    console.log("🧹 removed temp clip");
  } catch (e) {
    console.error("⚠ cleanup error:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

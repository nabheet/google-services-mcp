import fs from "node:fs";
import path from "node:path";
import type { Auth, youtube_v3 } from "googleapis";
import { google } from "googleapis";

export interface SearchVideosArgs {
  query: string;
  maxResults?: number;
}

export interface GetVideoArgs {
  videoId: string;
}

export async function searchVideos(
  client: Auth.OAuth2Client,
  { query, maxResults = 10 }: SearchVideosArgs,
): Promise<Array<{ id: string; type: string; title?: string; channelTitle?: string }>> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.search.list({
    part: ["snippet"],
    q: query,
    type: ["video"],
    maxResults,
  });
  return (res.data.items ?? []).map((item) => ({
    id: item.id?.videoId ?? item.id?.channelId ?? item.id?.playlistId ?? "",
    type: item.id?.videoId
      ? "video"
      : item.id?.channelId
        ? "channel"
        : item.id?.playlistId
          ? "playlist"
          : "unknown",
    title: item.snippet?.title ?? undefined,
    channelTitle: item.snippet?.channelTitle ?? undefined,
  }));
}

export async function getVideo(
  client: Auth.OAuth2Client,
  { videoId }: GetVideoArgs,
): Promise<youtube_v3.Schema$Video | null> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.videos.list({
    part: ["snippet", "contentDetails", "statistics"],
    id: [videoId],
  });
  return res.data.items?.[0] ?? null;
}

export interface UpdateVideoArgs {
  videoId: string;
  title?: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
}

export interface UploadVideoArgs {
  /** Local file path of the video to upload (preferred for large files). */
  path?: string;
  /** Base64-encoded video bytes (small files only). Mutually exclusive with path. */
  content?: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
  categoryId?: string;
  /** Notify subscribers (default false — safe). */
  notifySubscribers?: boolean;
}

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
  ".flv": "video/x-flv",
};

function mimeForPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  return MIME_BY_EXT[ext] ?? "video/mp4";
}

export async function uploadVideo(
  client: Auth.OAuth2Client,
  {
    path: filePath,
    content,
    title,
    description,
    tags,
    privacyStatus = "private",
    categoryId,
    notifySubscribers = false,
  }: UploadVideoArgs,
): Promise<youtube_v3.Schema$Video> {
  if (filePath !== undefined && content !== undefined) {
    throw new Error("Provide either path or content, not both.");
  }
  if (filePath === undefined && content === undefined) {
    throw new Error("Provide either a file path or base64 content.");
  }

  let media: { mimeType: string; body: fs.ReadStream | Buffer };
  if (filePath !== undefined) {
    // Open synchronously so a missing file fails fast (openSync throws) and
    // the stream is already open (no deferred open, no dangling ENOENT).
    const fd = fs.openSync(filePath, "r");
    media = {
      mimeType: mimeForPath(filePath),
      body: fs.createReadStream(filePath, { fd }),
    };
  } else {
    media = { mimeType: "video/mp4", body: Buffer.from(content as string, "base64") };
  }

  const yt = google.youtube({ version: "v3", auth: client });
  const res = await (
    yt.videos.insert as unknown as (
      params: youtube_v3.Params$Resource$Videos$Insert,
    ) => Promise<{ data: youtube_v3.Schema$Video }>
  )({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        ...(description !== undefined ? { description } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
      },
      status: {
        privacyStatus,
      },
    },
    notifySubscribers,
    media,
  });
  return res.data;
}

export async function updateVideo(
  client: Auth.OAuth2Client,
  { videoId, title, description, tags, privacyStatus }: UpdateVideoArgs,
): Promise<youtube_v3.Schema$Video> {
  const yt = google.youtube({ version: "v3", auth: client });
  // videos.update replaces each requested part wholesale, so fetch the
  // existing snippet/status and merge — otherwise fields like categoryId
  // are dropped and the API rejects the request.
  const existing = await yt.videos.list({
    part: ["snippet", "status"],
    id: [videoId],
  });
  const current = existing.data.items?.[0];
  if (!current) throw new Error(`video not found: ${videoId}`);
  const snippet = {
    ...(current.snippet ?? {}),
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(tags !== undefined ? { tags } : {}),
  };
  const status = {
    ...(current.status ?? {}),
    ...(privacyStatus !== undefined ? { privacyStatus } : {}),
  };
  const res = await yt.videos.update({
    part: ["snippet", "status"],
    requestBody: { id: videoId, snippet, status },
  });
  return res.data;
}

export async function getMyVideos(
  client: Auth.OAuth2Client,
  { maxResults = 25 }: { maxResults?: number },
): Promise<{ uploadsPlaylistId: string | null; videos: youtube_v3.Schema$PlaylistItem[] }> {
  // Find the uploads playlist for the signed-in channel, then list its items.
  const yt = google.youtube({ version: "v3", auth: client });
  const playlists = await yt.playlists.list({
    part: ["snippet"],
    mine: true,
    maxResults: 50,
  });
  const uploadsPlaylist = (playlists.data.items ?? []).find(
    (p) => p.id && p.snippet?.title === "Uploads",
  );
  if (!uploadsPlaylist?.id) {
    return { videos: [], uploadsPlaylistId: null };
  }
  const items = await yt.playlistItems.list({
    part: ["snippet", "contentDetails"],
    playlistId: uploadsPlaylist.id,
    maxResults,
  });
  return { uploadsPlaylistId: uploadsPlaylist.id, videos: items.data.items ?? [] };
}

export async function listPlaylists(
  client: Auth.OAuth2Client,
  { maxResults = 25 }: { maxResults?: number },
): Promise<youtube_v3.Schema$Playlist[]> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.playlists.list({
    part: ["snippet", "contentDetails"],
    mine: true,
    maxResults,
  });
  return res.data.items ?? [];
}

export async function createPlaylist(
  client: Auth.OAuth2Client,
  {
    title,
    description,
    privacyStatus = "private" as const,
  }: { title: string; description?: string; privacyStatus?: string },
): Promise<youtube_v3.Schema$Playlist> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title, description },
      status: { privacyStatus },
    },
  });
  return res.data;
}

export async function deletePlaylist(
  client: Auth.OAuth2Client,
  { playlistId }: { playlistId: string },
): Promise<{ deleted: boolean }> {
  const yt = google.youtube({ version: "v3", auth: client });
  await yt.playlists.delete({ id: playlistId });
  return { deleted: true };
}

export async function addVideoToPlaylist(
  client: Auth.OAuth2Client,
  { playlistId, videoId }: { playlistId: string; videoId: string },
): Promise<youtube_v3.Schema$PlaylistItem> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
    },
  });
  return res.data;
}

export async function removeVideoFromPlaylist(
  client: Auth.OAuth2Client,
  { playlistItemId }: { playlistItemId: string },
): Promise<{ deleted: boolean }> {
  const yt = google.youtube({ version: "v3", auth: client });
  await yt.playlistItems.delete({ id: playlistItemId });
  return { deleted: true };
}

export async function listSubscriptions(
  client: Auth.OAuth2Client,
  { maxResults = 50 }: { maxResults?: number },
): Promise<Array<{ title?: string; channelId?: string }>> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.subscriptions.list({
    part: ["snippet"],
    mine: true,
    maxResults,
  });
  return (res.data.items ?? []).map((item) => ({
    title: item.snippet?.title ?? undefined,
    channelId: item.snippet?.resourceId?.channelId ?? undefined,
  }));
}

export interface ListCommentsArgs {
  videoId: string;
  maxResults?: number;
}

export interface CommentSummary {
  id: string;
  videoId: string;
  text: string;
  author: string;
  publishedAt: string;
}

export async function listComments(
  client: Auth.OAuth2Client,
  { videoId, maxResults = 20 }: ListCommentsArgs,
): Promise<{ items: CommentSummary[]; nextPageToken: string | null }> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.commentThreads.list({
    part: ["snippet"],
    videoId,
    maxResults,
  });
  return {
    items: (res.data.items ?? []).map((thread) => {
      const comment = thread.snippet?.topLevelComment?.snippet;
      return {
        id: thread.id ?? "",
        videoId: thread.snippet?.videoId ?? "",
        text: comment?.textDisplay ?? "",
        author: comment?.authorDisplayName ?? "",
        publishedAt: comment?.publishedAt ?? "",
      };
    }),
    nextPageToken: res.data.nextPageToken ?? null,
  };
}

export interface InsertCommentArgs {
  videoId: string;
  text: string;
}

export async function insertComment(
  client: Auth.OAuth2Client,
  { videoId, text }: InsertCommentArgs,
): Promise<{ id: string }> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.comments.insert({
    part: ["snippet"],
    requestBody: { snippet: { videoId, textOriginal: text } },
  });
  return { id: res.data.id ?? "" };
}

export interface SetCommentModerationArgs {
  commentId: string;
  moderationStatus: "heldForReview" | "published" | "rejected";
}

export async function setCommentModeration(
  client: Auth.OAuth2Client,
  { commentId, moderationStatus }: SetCommentModerationArgs,
): Promise<{ commentId: string; moderationStatus: string }> {
  const yt = google.youtube({ version: "v3", auth: client });
  await yt.comments.setModerationStatus({ id: [commentId], moderationStatus });
  return { commentId, moderationStatus };
}

export interface MarkCommentAsSpamArgs {
  commentId: string;
}

export async function markCommentAsSpam(
  client: Auth.OAuth2Client,
  { commentId }: MarkCommentAsSpamArgs,
): Promise<{ commentId: string; markedAsSpam: boolean }> {
  const yt = google.youtube({ version: "v3", auth: client });
  await yt.comments.markAsSpam({ id: [commentId] });
  return { commentId, markedAsSpam: true };
}

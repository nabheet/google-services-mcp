import type { Auth } from "googleapis";
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
  { query, maxResults = 10 }: SearchVideosArgs
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
    type: item.id?.videoId ? "video" : item.id?.channelId ? "channel" : item.id?.playlistId ? "playlist" : "unknown",
    title: item.snippet?.title ?? undefined,
    channelTitle: item.snippet?.channelTitle ?? undefined,
  }));
}

export async function getVideo(client: Auth.OAuth2Client, { videoId }: GetVideoArgs): Promise<any> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.videos.list({
    part: ["snippet", "contentDetails", "statistics"],
    id: [videoId],
  });
  return res.data.items?.[0] ?? null;
}

export async function getMyVideos(
  client: Auth.OAuth2Client,
  { maxResults = 25 }: { maxResults?: number }
): Promise<any> {
  // Find the uploads playlist for the signed-in channel, then list its items.
  const yt = google.youtube({ version: "v3", auth: client });
  const playlists = await yt.playlists.list({
    part: ["snippet"],
    mine: true,
    maxResults: 50,
  });
  const uploadsPlaylist = (playlists.data.items ?? []).find((p) => p.id && p.snippet?.title === "Uploads");
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
  { maxResults = 25 }: { maxResults?: number }
): Promise<any[]> {
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
  { title, description, privacyStatus = "private" as const }: { title: string; description?: string; privacyStatus?: string }
): Promise<any> {
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
  { playlistId }: { playlistId: string }
): Promise<any> {
  const yt = google.youtube({ version: "v3", auth: client });
  await yt.playlists.delete({ id: playlistId });
  return { deleted: true };
}

export async function addVideoToPlaylist(
  client: Auth.OAuth2Client,
  { playlistId, videoId }: { playlistId: string; videoId: string }
): Promise<any> {
  const yt = google.youtube({ version: "v3", auth: client });
  const res = await yt.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
    },
  });
  return res.data;
}

export async function listSubscriptions(
  client: Auth.OAuth2Client,
  { maxResults = 50 }: { maxResults?: number }
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

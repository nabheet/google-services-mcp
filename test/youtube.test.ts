import { beforeEach, describe, expect, it, vi } from "vitest";

const mockYouTube = {
  search: { list: vi.fn() },
  videos: { list: vi.fn(), rate: vi.fn(), update: vi.fn() },
  playlists: { list: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  playlistItems: { list: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  subscriptions: { list: vi.fn() },
};

vi.mock("googleapis", () => ({
  google: {
    youtube: vi.fn(() => mockYouTube),
  },
}));

const client = {} as never;

import {
  addVideoToPlaylist,
  createPlaylist,
  deletePlaylist,
  getMyVideos,
  getVideo,
  listPlaylists,
  listSubscriptions,
  removeVideoFromPlaylist,
  searchVideos,
  updateVideo,
} from "../src/services/youtube.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("youtube service", () => {
  it("searchVideos searches and flattens items", async () => {
    mockYouTube.search.list.mockResolvedValue({
      data: {
        items: [
          { id: { videoId: "v1" }, snippet: { title: "T1", channelTitle: "C1" } },
          { id: { channelId: "c2" }, snippet: { title: "T2" } },
        ],
      },
    });
    const result = await searchVideos(client, { query: "cats", maxResults: 10 });
    expect(result).toEqual([
      { id: "v1", type: "video", title: "T1", channelTitle: "C1" },
      { id: "c2", type: "channel", title: "T2" },
    ]);
    expect(mockYouTube.search.list).toHaveBeenCalledWith({
      part: ["snippet"],
      q: "cats",
      type: ["video"],
      maxResults: 10,
    });
  });

  it("searchVideos defaults maxResults to 10", async () => {
    mockYouTube.search.list.mockResolvedValue({ data: { items: [] } });
    await searchVideos(client, { query: "dogs" });
    expect(mockYouTube.search.list).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 10 }),
    );
  });

  it("getVideo fetches video details", async () => {
    mockYouTube.videos.list.mockResolvedValue({
      data: { items: [{ id: "v1", snippet: { title: "T" } }] },
    });
    const result = await getVideo(client, { videoId: "v1" });
    expect(result.id).toBe("v1");
    expect(mockYouTube.videos.list).toHaveBeenCalledWith({
      part: ["snippet", "contentDetails", "statistics"],
      id: ["v1"],
    });
  });

  it("getMyVideos lists the user's uploads with manageable max", async () => {
    mockYouTube.playlists.list.mockResolvedValue({
      data: { items: [{ id: "uploads1", snippet: { title: "Uploads" } }] },
    });
    mockYouTube.playlistItems.list.mockResolvedValue({
      data: { items: [{ snippet: { title: "My upload" } }] },
    });
    const result = await getMyVideos(client, {});
    expect(result.videos).toEqual([{ snippet: { title: "My upload" } }]);
    // uploads playlist requested
    const playlistCall = mockYouTube.playlists.list.mock.calls[0][0];
    expect(playlistCall.mine).toBe(true);
    expect(mockYouTube.playlistItems.list).toHaveBeenCalledWith(
      expect.objectContaining({ playlistId: "uploads1", maxResults: 25 }),
    );
  });

  it("listPlaylists lists playlists", async () => {
    mockYouTube.playlists.list.mockResolvedValue({
      data: { items: [{ id: "pl1", snippet: { title: "P" } }] },
    });
    const result = await listPlaylists(client, {});
    expect(result).toEqual([{ id: "pl1", snippet: { title: "P" } }]);
    expect(mockYouTube.playlists.list).toHaveBeenCalledWith({
      part: ["snippet", "contentDetails"],
      mine: true,
      maxResults: 25,
    });
  });

  it("createPlaylist creates a playlist", async () => {
    mockYouTube.playlists.insert.mockResolvedValue({
      data: { id: "pl2", snippet: { title: "New" } },
    });
    const result = await createPlaylist(client, { title: "New", description: "d" });
    expect(result.id).toBe("pl2");
    expect(mockYouTube.playlists.insert).toHaveBeenCalledWith({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: "New", description: "d" },
        status: { privacyStatus: "private" },
      },
    });
  });

  it("deletePlaylist deletes a playlist", async () => {
    mockYouTube.playlists.delete.mockResolvedValue({ data: {} });
    const result = await deletePlaylist(client, { playlistId: "pl1" });
    expect(result).toEqual({ deleted: true });
    expect(mockYouTube.playlists.delete).toHaveBeenCalledWith({ id: "pl1" });
  });

  it("addVideoToPlaylist adds a video", async () => {
    mockYouTube.playlistItems.insert.mockResolvedValue({ data: { id: "pi1" } });
    const result = await addVideoToPlaylist(client, { playlistId: "pl1", videoId: "v1" });
    expect(result.id).toBe("pi1");
    expect(mockYouTube.playlistItems.insert).toHaveBeenCalledWith({
      part: ["snippet"],
      requestBody: {
        snippet: { playlistId: "pl1", resourceId: { kind: "youtube#video", videoId: "v1" } },
      },
    });
  });

  it("listSubscriptions lists channel subscriptions", async () => {
    mockYouTube.subscriptions.list.mockResolvedValue({
      data: { items: [{ snippet: { title: "S", resourceId: { channelId: "c1" } } }] },
    });
    const result = await listSubscriptions(client, { maxResults: 50 });
    expect(result).toEqual([{ title: "S", channelId: "c1" }]);
    expect(mockYouTube.subscriptions.list).toHaveBeenCalledWith({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
    });
  });

  it("removeVideoFromPlaylist removes a playlist item", async () => {
    mockYouTube.playlistItems.delete.mockResolvedValue({ data: {} });
    const result = await removeVideoFromPlaylist(client, { playlistItemId: "pi1" });
    expect(result).toEqual({ deleted: true });
    expect(mockYouTube.playlistItems.delete).toHaveBeenCalledWith({ id: "pi1" });
  });

  it("removeVideoFromPlaylist propagates API errors", async () => {
    mockYouTube.playlistItems.delete.mockRejectedValue(new Error("not found"));
    await expect(removeVideoFromPlaylist(client, { playlistItemId: "pi-missing" })).rejects.toThrow(
      "not found",
    );
  });

  it("updateVideo updates title and description, preserving categoryId", async () => {
    mockYouTube.videos.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "v1",
            snippet: { categoryId: "22", title: "Old", description: "Old desc" },
            status: { privacyStatus: "private" },
          },
        ],
      },
    });
    mockYouTube.videos.update.mockResolvedValue({
      data: { id: "v1", snippet: { title: "New title" } },
    });
    const result = await updateVideo(client, {
      videoId: "v1",
      title: "New title",
      description: "New desc",
    });
    expect(result.id).toBe("v1");
    // fetches existing first
    expect(mockYouTube.videos.list).toHaveBeenCalledWith({
      part: ["snippet", "status"],
      id: ["v1"],
    });
    expect(mockYouTube.videos.update).toHaveBeenCalledWith({
      part: ["snippet", "status"],
      requestBody: {
        id: "v1",
        snippet: { categoryId: "22", title: "New title", description: "New desc" },
        status: { privacyStatus: "private" },
      },
    });
  });

  it("updateVideo updates privacy status only", async () => {
    mockYouTube.videos.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "v1",
            snippet: { categoryId: "22", title: "T", description: "D" },
            status: { privacyStatus: "private" },
          },
        ],
      },
    });
    mockYouTube.videos.update.mockResolvedValue({ data: {} });
    await updateVideo(client, { videoId: "v1", privacyStatus: "unlisted" });
    expect(mockYouTube.videos.update).toHaveBeenCalledWith({
      part: ["snippet", "status"],
      requestBody: {
        id: "v1",
        snippet: { categoryId: "22", title: "T", description: "D" },
        status: { privacyStatus: "unlisted" },
      },
    });
  });

  it("updateVideo updates snippet and status together", async () => {
    mockYouTube.videos.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "v1",
            snippet: { categoryId: "22", title: "T", tags: ["old"] },
            status: { privacyStatus: "public" },
          },
        ],
      },
    });
    mockYouTube.videos.update.mockResolvedValue({ data: {} });
    await updateVideo(client, {
      videoId: "v1",
      tags: ["a", "b"],
      privacyStatus: "private",
    });
    expect(mockYouTube.videos.update).toHaveBeenCalledWith({
      part: ["snippet", "status"],
      requestBody: {
        id: "v1",
        snippet: { categoryId: "22", title: "T", tags: ["a", "b"] },
        status: { privacyStatus: "private" },
      },
    });
  });

  it("updateVideo throws when video not found", async () => {
    mockYouTube.videos.list.mockResolvedValue({ data: { items: [] } });
    await expect(updateVideo(client, { videoId: "missing", title: "x" })).rejects.toThrow(
      "video not found: missing",
    );
    expect(mockYouTube.videos.update).not.toHaveBeenCalled();
  });

  it("updateVideo propagates API errors", async () => {
    mockYouTube.videos.list.mockResolvedValue({
      data: {
        items: [{ id: "v1", snippet: { categoryId: "22" }, status: { privacyStatus: "private" } }],
      },
    });
    mockYouTube.videos.update.mockRejectedValue(new Error("forbidden"));
    await expect(updateVideo(client, { videoId: "v1", title: "x" })).rejects.toThrow("forbidden");
  });

  it("propagates API errors", async () => {
    mockYouTube.search.list.mockRejectedValue(new Error("quota exceeded"));
    await expect(searchVideos(client, { query: "x" })).rejects.toThrow("quota exceeded");
  });
});

import type { Auth } from "googleapis";
import { google } from "googleapis";

export interface ListDriveOptions {
  query?: string;
  pageSize?: number;
}

export interface GetDriveOptions {
  fileId: string;
}

export interface UploadDriveOptions {
  name: string;
  mimeType: string;
  /** Text content to upload. Omit to create a blank Google-native file. */
  content?: string;
  parentFolderId?: string;
}

export interface UpdateDriveOptions {
  fileId: string;
  name?: string;
  mimeType?: string;
  content?: string;
}

export interface ShareDriveOptions {
  fileId: string;
  email: string;
  role: "reader" | "writer" | "commenter";
  sendNotificationEmail?: boolean;
}

export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface DownloadDriveResult {
  /** Base64-encoded raw bytes (binary) or the raw string (text). */
  data: string;
  binary: boolean;
  mimeType?: string;
}

async function mapDownload(res: any): Promise<DownloadDriveResult> {
  let data = res.data;
  // googleapis returns a Blob (not Buffer/string) for alt=media and binary
  // exports — convert so Buffer.isBuffer works below.
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    data = Buffer.from(await data.arrayBuffer());
  }
  const binary = Buffer.isBuffer(data);
  return {
    data: binary ? data.toString("base64") : String(data ?? ""),
    binary,
  };
}

/** List files, optionally filtered by a Drive query (e.g. "'<folderId>' in parents"). */
export async function listDriveFiles(client: Auth.OAuth2Client, opts: ListDriveOptions): Promise<DriveFile[]> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.files.list({
    q: opts.query || undefined,
    pageSize: opts.pageSize ?? 25,
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)",
  });
  return (res.data.files ?? []).map((f) => mapFile(f));
}

/** Get metadata for a single file. */
export async function getDriveFile(client: Auth.OAuth2Client, opts: GetDriveOptions): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.files.get({
    fileId: opts.fileId,
    fields: "id,name,mimeType,size,createdTime,modifiedTime,webViewLink",
  });
  return mapFile(res.data);
}

/** Create a file (text content) or a blank Google-native file (Doc/Sheet/Slides). */
export async function uploadDriveFile(client: Auth.OAuth2Client, opts: UploadDriveOptions): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: any = { name: opts.name, mimeType: opts.mimeType };
  if (opts.parentFolderId) requestBody.parents = [opts.parentFolderId];
  const params: any = { requestBody };
  if (opts.content !== undefined) {
    params.media = { mimeType: opts.mimeType, body: opts.content };
  }
  const res = await drive.files.create(params);
  return mapFile(res.data);
}

/** Update a file's metadata and/or content. */
export async function updateDriveFile(client: Auth.OAuth2Client, opts: UpdateDriveOptions): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: any = {};
  if (opts.name !== undefined) requestBody.name = opts.name;
  if (opts.mimeType !== undefined) requestBody.mimeType = opts.mimeType;
  const params: any = { fileId: opts.fileId, requestBody };
  if (opts.content !== undefined) {
    params.media = { mimeType: opts.mimeType ?? "text/plain", body: opts.content };
  }
  const res = await drive.files.update(params);
  return mapFile(res.data);
}

/** Permanently delete a file. */
export async function deleteDriveFile(client: Auth.OAuth2Client, opts: GetDriveOptions): Promise<void> {
  const drive = google.drive({ version: "v3", auth: client });
  await drive.files.delete({ fileId: opts.fileId });
}

/** Share a file with a user by email. */
export async function shareDriveFile(client: Auth.OAuth2Client, opts: ShareDriveOptions): Promise<{ id: string }> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.permissions.create({
    fileId: opts.fileId,
    requestBody: {
      type: "user",
      role: opts.role,
      emailAddress: opts.email,
    },
    sendNotificationEmail: opts.sendNotificationEmail !== false,
  });
  return { id: (res.data.id ?? "") as string };
}

function mapFile(f: any): DriveFile {
  return {
    id: f.id as string,
    name: f.name as string | undefined,
    mimeType: f.mimeType as string | undefined,
    size: f.size as string | undefined,
    createdTime: f.createdTime as string | undefined,
    modifiedTime: f.modifiedTime as string | undefined,
    webViewLink: f.webViewLink as string | undefined,
  };
}

/** Download a file's raw bytes (non-Google-native files). */
export async function downloadDriveFile(client: Auth.OAuth2Client, opts: GetDriveOptions): Promise<DownloadDriveResult> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.files.get({ fileId: opts.fileId, alt: "media" });
  return mapDownload(res);
}

/** Export a Google-native file (Docs/Sheets/Slides) to another format. */
export async function exportDriveFile(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions & { mimeType: string }
): Promise<DownloadDriveResult> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.files.export({ fileId: opts.fileId, mimeType: opts.mimeType });
  return mapDownload(res);
}

/** Create a folder. */
export async function createDriveFolder(
  client: Auth.OAuth2Client,
  opts: { name: string; parentFolderId?: string }
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: any = { name: opts.name, mimeType: "application/vnd.google-apps.folder" };
  if (opts.parentFolderId) requestBody.parents = [opts.parentFolderId];
  const res = await drive.files.create({ requestBody });
  return mapFile(res.data);
}

/** Copy a file. */
export async function copyDriveFile(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions & { name?: string }
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: any = {};
  if (opts.name) requestBody.name = opts.name;
  const res = await drive.files.copy({ fileId: opts.fileId, requestBody });
  return mapFile(res.data);
}

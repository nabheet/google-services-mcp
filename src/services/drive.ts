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

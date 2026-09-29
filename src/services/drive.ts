import type { Auth, drive_v3 } from "googleapis";
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

export type DrivePermissionType = "user" | "group" | "anyone" | "domain";

export interface ShareDriveOptions {
  fileId: string;
  /** Recipient email (required when type is user/group). */
  email?: string;
  role: "reader" | "writer" | "commenter" | "owner";
  sendNotificationEmail?: boolean;
  /** Permission type. Default "user" for backward compatibility. */
  type?: DrivePermissionType;
  /** Domain for type=domain. */
  domain?: string;
  /** Transfer ownership to the recipient. Only valid with role=owner. */
  transferOwnership?: boolean;
}

export interface PermissionSummary {
  id: string;
  type?: string;
  role?: string;
  emailAddress?: string;
  domain?: string;
  allowFileDiscovery?: boolean;
}

export interface GetPermissionOptions {
  fileId: string;
  permissionId: string;
}

export interface MoveDriveOptions {
  fileId: string;
  /** Destination folder id. */
  parentFolderId: string;
  /** Current folder id to remove the file from. Omit to keep existing parents (add-only). */
  removeParentFolderId?: string;
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

async function mapDownload(res: { data: unknown }): Promise<DownloadDriveResult> {
  let data = res.data;
  // googleapis returns a Blob (not Buffer/string) for alt=media and binary
  // exports. Its Blob comes from gaxios' bundled fetch implementation, which
  // is NOT an instanceof the global Blob class — so duck-type via arrayBuffer()
  // instead of `instanceof Blob` (that check silently fails and the blob gets
  // String()-ified to "[object Blob]").
  if (data && typeof data === "object") {
    const blobish = data as { arrayBuffer?: () => Promise<ArrayBuffer> };
    if (typeof blobish.arrayBuffer === "function") {
      data = Buffer.from(await blobish.arrayBuffer());
    }
  }
  if (Buffer.isBuffer(data)) {
    return { data: data.toString("base64"), binary: true };
  }
  return { data: String(data ?? ""), binary: false };
}

/** List files, optionally filtered by a Drive query (e.g. "'<folderId>' in parents"). */
export async function listDriveFiles(
  client: Auth.OAuth2Client,
  opts: ListDriveOptions,
): Promise<DriveFile[]> {
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
export async function getDriveFile(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions,
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.files.get({
    fileId: opts.fileId,
    fields: "id,name,mimeType,size,createdTime,modifiedTime,webViewLink",
  });
  return mapFile(res.data);
}

/** Create a file (text content) or a blank Google-native file (Doc/Sheet/Slides). */
export async function uploadDriveFile(
  client: Auth.OAuth2Client,
  opts: UploadDriveOptions,
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: drive_v3.Schema$File = { name: opts.name, mimeType: opts.mimeType };
  if (opts.parentFolderId) requestBody.parents = [opts.parentFolderId];
  const params: drive_v3.Params$Resource$Files$Create = { requestBody };
  if (opts.content !== undefined) {
    params.media = { mimeType: opts.mimeType, body: opts.content };
  }
  const res = await drive.files.create(params);
  return mapFile(res.data);
}

/** Update a file's metadata and/or content. */
export async function updateDriveFile(
  client: Auth.OAuth2Client,
  opts: UpdateDriveOptions,
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: drive_v3.Schema$File = {};
  if (opts.name !== undefined) requestBody.name = opts.name;
  if (opts.mimeType !== undefined) requestBody.mimeType = opts.mimeType;
  const params: drive_v3.Params$Resource$Files$Update = { fileId: opts.fileId, requestBody };
  if (opts.content !== undefined) {
    params.media = { mimeType: opts.mimeType ?? "text/plain", body: opts.content };
  }
  const res = await drive.files.update(params);
  return mapFile(res.data);
}

/** Permanently delete a file. */
export async function deleteDriveFile(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions,
): Promise<void> {
  const drive = google.drive({ version: "v3", auth: client });
  await drive.files.delete({ fileId: opts.fileId });
}

/** Move a file into a folder (and optionally out of its current folder). */
export async function moveDriveFile(
  client: Auth.OAuth2Client,
  opts: MoveDriveOptions,
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const params: drive_v3.Params$Resource$Files$Update = {
    fileId: opts.fileId,
    addParents: opts.parentFolderId,
    fields: "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents",
  };
  if (opts.removeParentFolderId) params.removeParents = opts.removeParentFolderId;
  const res = await drive.files.update(params);
  return mapFile(res.data);
}

/** Share a file with a user by email (or anyone/domain via type). */
export async function shareDriveFile(
  client: Auth.OAuth2Client,
  opts: ShareDriveOptions,
): Promise<{ id: string }> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: drive_v3.Schema$Permission = {
    type: opts.type ?? "user",
    role: opts.role,
  };
  if (opts.email) requestBody.emailAddress = opts.email;
  if (opts.domain) requestBody.domain = opts.domain;
  const params: drive_v3.Params$Resource$Permissions$Create = {
    fileId: opts.fileId,
    requestBody,
    sendNotificationEmail: opts.sendNotificationEmail !== false,
  };
  if (opts.transferOwnership) params.transferOwnership = true;
  const res = await drive.permissions.create(params);
  return { id: (res.data.id ?? "") as string };
}

/** List the permissions on a file. */
export async function listDrivePermissions(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions,
): Promise<PermissionSummary[]> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.permissions.list({ fileId: opts.fileId });
  return (res.data.permissions ?? []).map((p) => ({
    id: p.id as string,
    type: p.type as string | undefined,
    role: p.role as string | undefined,
    emailAddress: p.emailAddress as string | undefined,
    domain: p.domain as string | undefined,
    allowFileDiscovery: p.allowFileDiscovery as boolean | undefined,
  }));
}

/** Delete a permission from a file. */
export async function deleteDrivePermission(
  client: Auth.OAuth2Client,
  opts: GetPermissionOptions,
): Promise<void> {
  const drive = google.drive({ version: "v3", auth: client });
  await drive.permissions.delete({ fileId: opts.fileId, permissionId: opts.permissionId });
}

function mapFile(f: drive_v3.Schema$File): DriveFile {
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
export async function downloadDriveFile(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions,
): Promise<DownloadDriveResult> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.files.get({ fileId: opts.fileId, alt: "media" });
  return mapDownload(res);
}

/** Export a Google-native file (Docs/Sheets/Slides) to another format. */
export async function exportDriveFile(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions & { mimeType: string },
): Promise<DownloadDriveResult> {
  const drive = google.drive({ version: "v3", auth: client });
  const res = await drive.files.export({ fileId: opts.fileId, mimeType: opts.mimeType });
  return mapDownload(res);
}

/** Create a folder. */
export async function createDriveFolder(
  client: Auth.OAuth2Client,
  opts: { name: string; parentFolderId?: string },
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: drive_v3.Schema$File = {
    name: opts.name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (opts.parentFolderId) requestBody.parents = [opts.parentFolderId];
  const res = await drive.files.create({ requestBody });
  return mapFile(res.data);
}

/** Copy a file. */
export async function copyDriveFile(
  client: Auth.OAuth2Client,
  opts: GetDriveOptions & { name?: string },
): Promise<DriveFile> {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody: drive_v3.Schema$File = {};
  if (opts.name) requestBody.name = opts.name;
  const res = await drive.files.copy({ fileId: opts.fileId, requestBody });
  return mapFile(res.data);
}

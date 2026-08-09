import type { Auth, slides_v1 } from "googleapis";
import { google } from "googleapis";

export interface GetPresentationArgs {
  presentationId: string;
}

export interface ReplaceAllTextArgs {
  presentationId: string;
  find: string;
  replace: string;
  matchCase?: boolean;
}

export async function getPresentation(client: Auth.OAuth2Client, { presentationId }: GetPresentationArgs): Promise<any> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.get({ presentationId });
  return res.data;
}

export async function getSlidePage(
  client: Auth.OAuth2Client,
  { presentationId, pageObjectId }: GetPresentationArgs & { pageObjectId: string }
): Promise<any> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.pages.get({ presentationId, pageObjectId });
  return res.data;
}

export async function createPresentation(client: Auth.OAuth2Client, { title }: { title: string }): Promise<any> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.create({ requestBody: { title } });
  return res.data;
}

export async function replaceAllText(
  client: Auth.OAuth2Client,
  { presentationId, find, replace, matchCase = true }: ReplaceAllTextArgs
): Promise<any> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        { replaceAllText: { containsText: { text: find, matchCase }, replaceText: replace } },
      ],
    },
  });
  return res.data.replies?.[0]?.replaceAllText ?? { occurrencesChanged: 0 };
}

export async function createSlide(
  client: Auth.OAuth2Client,
  { presentationId }: GetPresentationArgs
): Promise<any> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        { createSlide: { slideLayoutReference: { predefinedLayout: "BLANK" as const } } },
      ],
    },
  });
  return res.data.replies?.[0]?.createSlide ?? { objectId: undefined };
}

export async function deleteSlide(
  client: Auth.OAuth2Client,
  { presentationId, slideObjectId }: GetPresentationArgs & { slideObjectId: string }
): Promise<any> {
  const slides = google.slides({ version: "v1", auth: client });
  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests: [{ deleteObject: { objectId: slideObjectId } }] },
  });
  return { deleted: true };
}

export type BatchUpdateArgs = {
  presentationId: string;
  requests: slides_v1.Schema$Request[];
};

export async function batchUpdatePresentation(
  client: Auth.OAuth2Client,
  { presentationId, requests }: BatchUpdateArgs
): Promise<any> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
  return res.data;
}

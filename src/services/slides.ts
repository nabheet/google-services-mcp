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

export async function getPresentation(
  client: Auth.OAuth2Client,
  { presentationId }: GetPresentationArgs,
): Promise<slides_v1.Schema$Presentation> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.get({ presentationId });
  return res.data;
}

export async function getSlidePage(
  client: Auth.OAuth2Client,
  { presentationId, pageObjectId }: GetPresentationArgs & { pageObjectId: string },
): Promise<slides_v1.Schema$Page> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.pages.get({ presentationId, pageObjectId });
  return res.data;
}

export async function createPresentation(
  client: Auth.OAuth2Client,
  { title }: { title: string },
): Promise<slides_v1.Schema$Presentation> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.create({ requestBody: { title } });
  return res.data;
}

export async function replaceAllText(
  client: Auth.OAuth2Client,
  { presentationId, find, replace, matchCase = true }: ReplaceAllTextArgs,
): Promise<slides_v1.Schema$ReplaceAllTextResponse> {
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
  { presentationId }: GetPresentationArgs,
): Promise<slides_v1.Schema$CreateSlideResponse> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [{ createSlide: { slideLayoutReference: { predefinedLayout: "BLANK" as const } } }],
    },
  });
  return res.data.replies?.[0]?.createSlide ?? { objectId: undefined };
}

export async function deleteSlide(
  client: Auth.OAuth2Client,
  { presentationId, slideObjectId }: GetPresentationArgs & { slideObjectId: string },
): Promise<{ deleted: boolean }> {
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
  { presentationId, requests }: BatchUpdateArgs,
): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
  return res.data;
}

export interface DuplicateSlideArgs {
  presentationId: string;
  slideObjectId: string;
}

export async function duplicateSlide(
  client: Auth.OAuth2Client,
  { presentationId, slideObjectId }: DuplicateSlideArgs,
): Promise<{ objectId?: string | null }> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests: [{ duplicateObject: { objectId: slideObjectId } }] },
  });
  return res.data.replies?.[0]?.duplicateObject ?? { objectId: undefined };
}

export interface MoveSlideArgs {
  presentationId: string;
  slideObjectId: string;
  insertionIndex: number;
}

export async function moveSlide(
  client: Auth.OAuth2Client,
  { presentationId, slideObjectId, insertionIndex }: MoveSlideArgs,
): Promise<{ slideObjectIds?: string[]; insertionIndex?: number }> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [{ updateSlidesPosition: { slideObjectIds: [slideObjectId], insertionIndex } }],
    },
  });
  const reply = res.data.replies?.[0] as
    | { updateSlidesPosition?: { slideObjectIds?: string[]; insertionIndex?: number } }
    | undefined;
  return (
    reply?.updateSlidesPosition ?? {
      slideObjectIds: [slideObjectId],
      insertionIndex,
    }
  );
}

export interface CreateTextboxArgs {
  presentationId: string;
  pageObjectId: string;
  text?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

const EMU_PER_POINT = 12700;

export async function createTextbox(
  client: Auth.OAuth2Client,
  { presentationId, pageObjectId, text, width = 100, height = 50, x = 0, y = 0 }: CreateTextboxArgs,
): Promise<{ objectId?: string }> {
  const slides = google.slides({ version: "v1", auth: client });
  const objectId = `tb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const requests: slides_v1.Schema$Request[] = [
    {
      createShape: {
        objectId,
        shapeType: "TEXT_BOX" as const,
        elementProperties: {
          pageObjectId,
          size: {
            width: { magnitude: width * EMU_PER_POINT, unit: "EMU" as const },
            height: { magnitude: height * EMU_PER_POINT, unit: "EMU" as const },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x * EMU_PER_POINT,
            translateY: y * EMU_PER_POINT,
            unit: "EMU" as const,
          },
        },
      },
    },
  ];
  if (text) {
    requests.push({ insertText: { objectId, insertionIndex: 0, text } });
  }
  const res = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  });
  const created = res.data.replies?.[0]?.createShape;
  return { objectId: created?.objectId ?? objectId };
}

export interface CreateImageArgs {
  presentationId: string;
  pageObjectId: string;
  url: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export async function createImage(
  client: Auth.OAuth2Client,
  { presentationId, pageObjectId, url, width = 200, height = 150, x = 0, y = 0 }: CreateImageArgs,
): Promise<{ objectId?: string | null }> {
  const slides = google.slides({ version: "v1", auth: client });
  const res = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        {
          createImage: {
            url,
            elementProperties: {
              pageObjectId,
              size: {
                width: { magnitude: width * EMU_PER_POINT, unit: "EMU" as const },
                height: { magnitude: height * EMU_PER_POINT, unit: "EMU" as const },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: x * EMU_PER_POINT,
                translateY: y * EMU_PER_POINT,
                unit: "EMU" as const,
              },
            },
          },
        },
      ],
    },
  });
  return res.data.replies?.[0]?.createImage ?? { objectId: undefined };
}

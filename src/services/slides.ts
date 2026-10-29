import type { Auth, slides_v1 } from "googleapis";
import { google } from "googleapis";
import { requireObjectId, requireReply } from "../util/replies.js";

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
  const reply = requireReply(res.data.replies, "replaceAllText");
  const result = (reply as { replaceAllText?: slides_v1.Schema$ReplaceAllTextResponse })
    .replaceAllText;
  if (!result) {
    throw new Error(
      "replaceAllText: the API returned no replacement result, so nothing is confirmed.",
    );
  }
  return result;
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
  const reply = requireReply(res.data.replies, "createSlide");
  const created = (reply as { createSlide?: slides_v1.Schema$CreateSlideResponse }).createSlide;
  return { objectId: requireObjectId(created?.objectId, "createSlide") };
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
  const reply = requireReply(res.data.replies, "duplicateSlide");
  const copy = (reply as { duplicateObject?: { objectId?: string | null } }).duplicateObject;
  return { objectId: requireObjectId(copy?.objectId, "duplicateSlide") };
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
  const reply = requireReply(res.data.replies, "moveSlide") as {
    updateSlidesPosition?: { slideObjectIds?: string[]; insertionIndex?: number };
  };
  const moved = reply.updateSlidesPosition;
  if (!moved) {
    throw new Error(
      "moveSlide: the API returned no move result, so the new position is unconfirmed.",
    );
  }
  return moved;
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
  const reply = requireReply(res.data.replies, "createTextbox") as {
    createShape?: { objectId?: string | null };
  };
  return { objectId: requireObjectId(reply.createShape?.objectId ?? objectId, "createTextbox") };
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
  const reply = requireReply(res.data.replies, "createImage");
  const image = (reply as { createImage?: { objectId?: string | null } }).createImage;
  return { objectId: requireObjectId(image?.objectId, "createImage") };
}

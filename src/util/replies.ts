/**
 * Batch-update replies are positional: reply N belongs to request N. The API
 * returns one reply per request, so a missing reply means it did not confirm
 * that request. Callers must not report success from an absent reply — that
 * turns "the write may not have happened" into "done".
 */
export function requireReply<T>(replies: T[] | null | undefined, request: string): T {
  const reply = replies?.[0];
  if (reply === undefined || reply === null) {
    throw new Error(
      `${request}: the API returned no reply for this request, so the change is unconfirmed.`,
    );
  }
  return reply;
}

/** A batch-update response object that carries no result id and cannot be verified. */
export function requireObjectId(objectId: string | null | undefined, request: string): string {
  if (!objectId) {
    throw new Error(`${request}: the API returned no object id, so the created object is unknown.`);
  }
  return objectId;
}

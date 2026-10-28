/**
 * One page of a paginated list. Every list tool returns this shape so callers
 * can tell the difference between "that is everything" and "there is another
 * page": pass `nextPageToken` back as `pageToken` to continue.
 */
export interface ListPage<T> {
  items: T[];
  /** Present only when another page exists. */
  nextPageToken?: string;
}

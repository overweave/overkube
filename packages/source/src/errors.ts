import type { QueryError } from '@overkube/query';

/*
 * What went wrong asking the cluster, as a query says it: the API server's
 * status and reason (an ApiError's), else what was thrown. Refused (403:
 * not allowed) apart from passing (the cluster busy, down, out of reach:
 * worth asking again a while after) and the rest.
 */

/** Anything thrown asking the cluster, as a QueryError. */
export function queryErrorOf(e: unknown): QueryError {
  if (e === null || e === undefined) return { code: 'unknown', message: 'something went wrong' };
  const err = e as { status?: number; code?: string; message?: string };
  return { ...(err?.status ? { status: err.status } : {}), code: err?.code ?? 'error', message: err?.message ?? String(e) };
}

/** Not allowed (403): asked otherwise (namespace by namespace), or told so — not asked again soon. */
export const refusedBy = (e: QueryError): boolean => e.status === 403;

/** Worth asking again a while after: nothing answering, the cluster busy or down (not refused, not signed out, not closed). */
export const passingBy = (e: QueryError): boolean =>
  !['unauthorized', 'closed', 'bad_json'].includes(e.code) && (e.status === undefined || e.status === 0 || e.status === 429 || e.status >= 500);

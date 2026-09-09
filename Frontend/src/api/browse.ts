import type { BrowseQuery, SuggestionsResponse } from '../types/browse';
import { API_ROOT } from './profile';

/**
 * Browsing API client.
 *
 * Reuses API_ROOT from api/profile.ts so the backend origin is derived in
 * exactly one place (and so a legacy VITE_API_BASE_URL ending in /auth is still
 * normalized correctly). Adds its own 10s timeout, matching api/auth.ts.
 */

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Serializes a BrowseQuery into a query string.
 * Empty/undefined values are omitted entirely so the backend applies its own
 * defaults rather than seeing blank parameters it would reject.
 */
export const buildSuggestionsQueryString = (query: BrowseQuery): string => {
  const params = new URLSearchParams();

  const setNumber = (key: string, value?: number) => {
    if (value !== undefined && Number.isFinite(value)) params.set(key, String(value));
  };

  setNumber('minAge', query.minAge);
  setNumber('maxAge', query.maxAge);
  setNumber('minFame', query.minFame);
  setNumber('maxFame', query.maxFame);

  if (query.location && query.location.trim()) params.set('location', query.location.trim());
  if (query.tags && query.tags.length > 0) params.set('tags', query.tags.join(','));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);

  setNumber('page', query.page);
  setNumber('limit', query.limit);

  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

/**
 * GET /api/browse/suggestions
 *
 * Bounded by REQUEST_TIMEOUT_MS so a hung backend surfaces a clear message
 * instead of leaving the grid in its loading state forever.
 */
export const fetchSuggestions = async (
  query: BrowseQuery,
  options?: { signal?: AbortSignal }
): Promise<SuggestionsResponse> => {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardCallerAbort = () => controller.abort();
  const callerSignal = options?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', forwardCallerAbort, { once: true });
  }

  try {
    const url = `${API_ROOT}/browse/suggestions${buildSuggestionsQueryString(query)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error: any) {
      if (callerSignal?.aborted && !timedOut) throw error;
      if (timedOut) {
        throw new Error(
          `Matcha server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`
        );
      }
      throw new Error(
        'Unable to connect to Matcha server. Is the backend running on port 3000?'
      );
    }

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message =
        body?.message ||
        (Array.isArray(body?.errors) && body.errors.length > 0 ? body.errors.join(', ') : null) ||
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    if (!body?.data) {
      throw new Error('Malformed response from the suggestions endpoint');
    }

    return body.data as SuggestionsResponse;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardCallerAbort);
  }
};

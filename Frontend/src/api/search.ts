import { API_ROOT } from './profile';
import type { SearchQuery, SearchResponse } from '../types/search';

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

const REQUEST_TIMEOUT_MS = 10_000;

const buildSearchQueryString = (query: SearchQuery): string => {
  const params = new URLSearchParams();
  const setNumber = (key: string, value?: number) => {
    if (value !== undefined && Number.isFinite(value)) params.set(key, String(value));
  };

  setNumber('minAge', query.minAge);
  setNumber('maxAge', query.maxAge);
  setNumber('minFame', query.minFame);
  setNumber('maxFame', query.maxFame);
  if (query.location?.trim()) params.set('location', query.location.trim());
  if (query.tags && query.tags.length > 0) params.set('tags', query.tags.join(','));
  if (query.tagsMatch) params.set('tagsMatch', query.tagsMatch);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  setNumber('page', query.page);
  setNumber('limit', query.limit);

  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const fetchSearchResults = async (
  query: SearchQuery,
  options?: { signal?: AbortSignal }
): Promise<SearchResponse> => {
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
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}/search${buildSearchQueryString(query)}`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error: any) {
      if (callerSignal?.aborted && !timedOut) throw error;
      if (timedOut) {
        throw new Error(`Matcha server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`);
      }
      throw new Error('Unable to connect to Matcha server. Is the backend running on port 3000?');
    }

    let body: ApiEnvelope<SearchResponse> | null = null;
    try {
      body = (await response.json()) as ApiEnvelope<SearchResponse>;
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

    if (!body?.data) throw new Error('Malformed response from the search endpoint');
    return body.data;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardCallerAbort);
  }
};

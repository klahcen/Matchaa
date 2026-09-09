import { API_ROOT } from './profile';
import type { Conversation, Message, ChatUnreadCount } from '../types/chat';

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(
  endpoint: string,
  options: RequestInit & { signal?: AbortSignal } = {}
): Promise<T> {
  const { signal: callerSignal, ...rest } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', forwardCallerAbort, { once: true });
  }

  try {
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${endpoint}`, {
        ...rest,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(rest.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (error: any) {
      if (callerSignal?.aborted && !timedOut) throw error;
      if (timedOut) {
        throw new Error(
          `Matcha server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`
        );
      }
      throw new Error('Unable to connect to Matcha server. Is the backend running on port 3000?');
    }

    let body: ApiEnvelope<T> | null = null;
    try {
      body = (await response.json()) as ApiEnvelope<T>;
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

    return (body?.data ?? (null as T)) as T;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardCallerAbort);
  }
}

export const chatApi = {
  getConversations: (): Promise<{ conversations: Conversation[] }> =>
    request('/chat/conversations', { method: 'GET' }),

  getMessages: (userId: number, options?: { limit?: number; beforeId?: number; signal?: AbortSignal }): Promise<{ messages: Message[] }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.beforeId) params.set('beforeId', String(options.beforeId));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/chat/${userId}/messages${query}`, { method: 'GET', signal: options?.signal });
  },

  getUnreadCount: (): Promise<ChatUnreadCount> =>
    request('/chat/unread-count', { method: 'GET' }),
};
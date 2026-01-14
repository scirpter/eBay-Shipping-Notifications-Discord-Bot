import pRetry, { AbortError } from 'p-retry';

import { logger } from '../../logger.js';

export type FetchJsonOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeoutMs?: number;
  retries?: number;
  retryStatusCodes?: number[];
};

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<{ status: number; headers: Headers; data: T }> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 20_000,
    retries = 3,
    retryStatusCodes = [408, 425, 429, 500, 502, 503, 504],
  } = options;

  return pRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers,
          signal: controller.signal,
          ...(body !== undefined ? { body } : {}),
        });

        const status = response.status;
        const text = await response.text();

        if (retryStatusCodes.includes(status)) {
          throw new Error(`Retryable HTTP ${status}`);
        }
        if (!response.ok) {
          throw new AbortError(`HTTP ${status}: ${text.slice(0, 500)}`);
        }

        const data = text.length ? (JSON.parse(text) as T) : (null as T);
        return { status, headers: response.headers, data };
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      retries,
      onFailedAttempt: (error) => {
        logger.warn(
          { url, method, attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error },
          'fetchJson failed, retrying',
        );
      },
    },
  );
}

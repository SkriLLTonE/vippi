import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './http';

const NO_RETRY_STATUSES = new Set([400, 401, 403, 404, 409, 410, 413, 415, 422, 429]);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          if (isApiError(error) && NO_RETRY_STATUSES.has(error.status)) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

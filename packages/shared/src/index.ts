// Shared Zod schemas and derived types used by both the API and the web app.
// API response types live here so the frontend never re-declares them.

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every error response has exactly this shape (see docs/CONCEPT.md 3.4). */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

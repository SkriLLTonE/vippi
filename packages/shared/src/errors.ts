export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'CSV_INVALID',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'INVALID_API_KEY',
  'FORBIDDEN',
  'ORIGIN_MISMATCH',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_TAKEN',
  'INVITATION_EXISTS',
  'INVITATION_INVALID',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_FILE',
  'INVALID_STATUS_TRANSITION',
  'FIRST_CONTACT_ALREADY_RECORDED',
  'ASSIGNEE_INVALID',
  'CANNOT_MODIFY_SELF',
  'API_KEY_LIMIT',
  'EXPORT_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorDetail {
  path: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  };
}

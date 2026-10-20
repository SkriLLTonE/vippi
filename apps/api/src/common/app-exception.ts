import { HttpException } from '@nestjs/common';
import type { ApiErrorDetail, ErrorCode } from '@vippi/shared';

export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ApiErrorDetail[],
    readonly headers?: Record<string, string>,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = () => new AppException(404, 'NOT_FOUND', 'Resource not found');
export const forbidden = () => new AppException(403, 'FORBIDDEN', 'Forbidden');
export const unprocessable = (code: ErrorCode, message: string) => new AppException(422, code, message);
export const validationFailed = (path: string, code: string, message = code) =>
  new AppException(400, 'VALIDATION_FAILED', 'Request validation failed', [{ path, code, message }]);

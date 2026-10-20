import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorBody, ApiErrorDetail, ErrorCode } from '@vippi/shared';
import { AppException } from './app-exception.js';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_FILE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

interface Normalized {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ApiErrorDetail[];
  headers?: Record<string, string>;
}

export function normalizeError(exception: unknown): Normalized {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
      headers: exception.headers,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      code: STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED'),
      message: status >= 500 ? 'Internal server error' : exception.message,
    };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') return { status: 409, code: 'CONFLICT', message: 'Conflict' };
    if (exception.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
  }
  const maybe = exception as { status?: unknown; type?: unknown } | null;
  if (maybe && maybe.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' };
  }
  if (maybe && maybe.type === 'entity.parse.failed') {
    return { status: 400, code: 'VALIDATION_FAILED', message: 'Malformed JSON body' };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

/** Converts every error to the SPEC §13.2 format. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const n = normalizeError(exception);
    const requestId = String(req.headers['x-request-id'] ?? '');

    if (n.status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error({ requestId, errName: err.name, errMessage: err.message, stack: err.stack }, 'Unhandled error');
    }
    if (res.headersSent) return;
    if (n.headers) for (const [k, v] of Object.entries(n.headers)) res.setHeader(k, v);
    const body: ApiErrorBody = {
      error: { code: n.code, message: n.message, ...(n.details ? { details: n.details } : {}), requestId },
    };
    res.status(n.status).json(body);
  }
}

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp, userAgent } from './request-context.js';

export interface ReqMeta {
  ip: string | null;
  userAgent: string | null;
}

export const RequestMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext): ReqMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: clientIp(req), userAgent: userAgent(req) };
});

export const SYSTEM_META: ReqMeta = { ip: null, userAgent: null };

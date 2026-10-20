import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Accepts X-Request-Id from the client (if sane) or generates one; echoes it in the response. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const value = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.headers['x-request-id'] = value;
  res.setHeader('X-Request-Id', value);
  next();
}

export function clientIp(req: Request): string | null {
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return ua ? ua.slice(0, 256) : null;
}

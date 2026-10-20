import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../config/env.js';
import type { RequestWithActor } from './actor.js';

/** SEC-013 / NFR-016: no passwords, tokens, keys, phones or lead texts in logs. */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.phone',
  '*.message',
  '*.token',
  '*.key',
  '*.fullName',
  '*.email',
];

export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      genReqId: (req: IncomingMessage) => String(req.headers['x-request-id'] ?? ''),
      autoLogging: {
        ignore: (req: IncomingMessage) => (req.url ?? '').startsWith('/api/health'),
      },
      customProps: (req: IncomingMessage) => {
        const actor = (req as IncomingMessage & RequestWithActor).actor;
        const apiKey = (req as IncomingMessage & RequestWithActor).apiKeyActor;
        return {
          requestId: String(req.headers['x-request-id'] ?? ''),
          organizationId: actor?.orgId ?? apiKey?.orgId,
          userId: actor?.userId,
        };
      },
      serializers: {
        req: (req: { method?: string; url?: string }) => ({
          method: req.method,
          route: (req.url ?? '').split('?')[0],
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    },
  };
}

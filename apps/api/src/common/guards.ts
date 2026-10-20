import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasPermission, type FeatureFlag, type Permission } from '@vippi/shared';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import type { RequestWithActor } from './actor.js';
import { AppException } from './app-exception.js';
import { ACCESS_KEY, type AccessKind, FEATURE_KEY, PERMISSION_KEY } from './decorators.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionsService } from '../modules/identity-access/sessions.service.js';
import { ApiKeysService } from '../modules/organizations/api-keys.service.js';

function accessOf(reflector: Reflector, ctx: ExecutionContext): AccessKind | undefined {
  return reflector.getAllAndOverride<AccessKind | undefined>(ACCESS_KEY, [ctx.getHandler(), ctx.getClass()]);
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** SEC-005: Origin (or Referer) of state-changing requests must match PUBLIC_APP_URL. */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) return true;
    if (accessOf(this.reflector, ctx) === 'apiKey') return true;
    const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
    if (origin !== this.config.publicOrigin) {
      throw new AppException(403, 'ORIGIN_MISMATCH', 'Origin is not allowed');
    }
    return true;
  }
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/** Resolves the session cookie for every non-public route (SEC-003, SEC-006). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const access = accessOf(this.reflector, ctx);
    if (access === 'public' || access === 'apiKey') return true;
    if (access === undefined) {
      // Every route must declare its access policy explicitly.
      throw new AppException(403, 'FORBIDDEN', 'Route has no access policy');
    }
    const req = ctx.switchToHttp().getRequest<Request & RequestWithActor>();
    const actor = await this.sessions.authenticate(req, ctx.switchToHttp().getResponse());
    if (!actor) throw new AppException(401, 'UNAUTHENTICATED', 'Authentication required');
    req.actor = actor;
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (accessOf(this.reflector, ctx) !== 'permission') return true;
    const permission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<RequestWithActor>();
    if (!req.actor || !hasPermission(req.actor.role, permission)) {
      throw new AppException(403, 'FORBIDDEN', 'Forbidden');
    }
    return true;
  }
}

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<FeatureFlag | undefined>(FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (flag && !this.config.features[flag]) throw new AppException(404, 'NOT_FOUND', 'Resource not found');
    return true;
  }
}

/** SEC-008 + FR-063: X-Api-Key authentication and per-key rate limit. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & RequestWithActor>();
    const raw = req.headers['x-api-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    const resolved = key ? await this.apiKeys.resolve(key) : null;
    if (!resolved) throw new AppException(401, 'INVALID_API_KEY', 'Invalid API key');
    const retryAfter = this.limiter.hit(`intake:${resolved.apiKeyId}`, this.config.INTAKE_RATE_LIMIT_PER_MIN, 60_000);
    if (retryAfter > 0) {
      throw new AppException(429, 'RATE_LIMITED', 'Too many requests', undefined, {
        'Retry-After': String(retryAfter),
      });
    }
    req.apiKeyActor = resolved;
    return true;
  }
}

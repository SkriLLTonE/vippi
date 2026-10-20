import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FeatureFlag, Permission } from '@vippi/shared';
import type { Actor, ApiKeyActor, RequestWithActor } from './actor.js';
import { AppException } from './app-exception.js';

export const ACCESS_KEY = 'vippi:access';
export const PERMISSION_KEY = 'vippi:permission';
export const FEATURE_KEY = 'vippi:feature';

export type AccessKind = 'public' | 'apiKey' | 'authenticated' | 'permission';

/** Route without authentication. */
export const Public = () => SetMetadata(ACCESS_KEY, 'public' satisfies AccessKind);
/** Route authenticated by X-Api-Key (intake). */
export const ApiKeyAuth = () => SetMetadata(ACCESS_KEY, 'apiKey' satisfies AccessKind);
/** Any active member of an organization. */
export const Authenticated = () => SetMetadata(ACCESS_KEY, 'authenticated' satisfies AccessKind);

/** Member with a specific permission (PRD §14). */
export function RequirePermission(permission: Permission): MethodDecorator & ClassDecorator {
  const access = SetMetadata(ACCESS_KEY, 'permission' satisfies AccessKind);
  const perm = SetMetadata(PERMISSION_KEY, permission);
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor && key !== undefined) {
      access(target, key, descriptor);
      perm(target, key, descriptor);
    } else {
      (access as ClassDecorator)(target as never);
      (perm as ClassDecorator)(target as never);
    }
  };
}

/** Cut-line feature flag (ADR-020): route answers 404 when the feature is disabled. */
export const RequireFeature = (flag: FeatureFlag) => SetMetadata(FEATURE_KEY, flag);

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<RequestWithActor>();
  if (!req.actor) throw new AppException(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.actor;
});

export const CurrentApiKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): ApiKeyActor => {
  const req = ctx.switchToHttp().getRequest<RequestWithActor>();
  if (!req.apiKeyActor) throw new AppException(401, 'INVALID_API_KEY', 'Invalid API key');
  return req.apiKeyActor;
});

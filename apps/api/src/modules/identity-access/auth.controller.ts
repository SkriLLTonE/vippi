import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ChangePasswordSchema,
  LoginSchema,
  RegisterOrganizationSchema,
  UpdateProfileSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type MeResponse,
  type RegisterOrganizationRequest,
  type UpdateProfileRequest,
} from '@vippi/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/actor.js';
import { AppException } from '../../common/app-exception.js';
import { Authenticated, CurrentActor, Public } from '../../common/decorators.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { RequestMeta, type ReqMeta } from '../../common/req-meta.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private limitIp(meta: ReqMeta, bucket: string, limit: number, windowMs: number): void {
    const retryAfter = this.limiter.hit(`${bucket}:${meta.ip ?? 'unknown'}`, limit, windowMs);
    if (retryAfter > 0) {
      throw new AppException(429, 'RATE_LIMITED', 'Too many requests', undefined, { 'Retry-After': String(retryAfter) });
    }
  }

  private authIpLimit(meta: ReqMeta): void {
    this.limitIp(meta, 'auth', this.config.AUTH_IP_RATE_LIMIT_PER_MIN, 60_000);
  }

  @Post('auth/register-organization')
  @Public()
  @ApiZodBody(RegisterOrganizationSchema)
  async register(
    @Body(new ZodPipe(RegisterOrganizationSchema)) body: RegisterOrganizationRequest,
    @RequestMeta() meta: ReqMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    this.authIpLimit(meta);
    this.limitIp(meta, 'register', 5, 3_600_000);
    const { token, me } = await this.auth.register(body, meta);
    this.sessions.setCookie(res, token);
    return me;
  }

  @Post('auth/login')
  @Public()
  @HttpCode(200)
  @ApiZodBody(LoginSchema)
  async login(
    @Body(new ZodPipe(LoginSchema)) body: LoginRequest,
    @RequestMeta() meta: ReqMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    this.authIpLimit(meta);
    const { token, me } = await this.auth.login(body, meta);
    this.sessions.setCookie(res, token);
    return me;
  }

  @Post('auth/logout')
  @Authenticated()
  @HttpCode(204)
  async logout(
    @CurrentActor() actor: Actor,
    @RequestMeta() meta: ReqMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(actor, meta);
    this.sessions.clearCookie(res);
  }

  @Get('auth/me')
  @Authenticated()
  me(@CurrentActor() actor: Actor): Promise<MeResponse> {
    return this.auth.me(actor.userId, actor.orgId, actor.role);
  }

  @Patch('me')
  @Authenticated()
  @ApiZodBody(UpdateProfileSchema)
  updateProfile(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(UpdateProfileSchema)) body: UpdateProfileRequest,
  ): Promise<MeResponse> {
    return this.auth.updateProfile(actor, body);
  }

  @Post('me/password')
  @Authenticated()
  @HttpCode(204)
  @ApiZodBody(ChangePasswordSchema)
  async changePassword(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(ChangePasswordSchema)) body: ChangePasswordRequest,
    @RequestMeta() meta: ReqMeta,
  ): Promise<void> {
    await this.auth.changePassword(actor, body, meta);
  }
}

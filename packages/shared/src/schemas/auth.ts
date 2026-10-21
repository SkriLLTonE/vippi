import { z } from 'zod';
import type { Locale, Role } from '../enums.js';
import { ROLES } from '../enums.js';
import type { FeatureFlags } from '../features.js';
import type { Permission } from '../permissions.js';
import { emailSchema, localeSchema, passwordSchema } from './common.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .min(2, { message: 'too_short' })
  .max(100);

export const RegisterOrganizationSchema = z
  .object({
    organizationName: nameSchema,
    fullName: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    locale: localeSchema.optional(),
  })
  .strict()
  .refine((v) => v.password.toLowerCase() !== v.email.toLowerCase(), {
    path: ['password'],
    message: 'password_equals_email',
  });
export type RegisterOrganizationRequest = z.infer<typeof RegisterOrganizationSchema>;

export const LoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, { message: 'required' }).max(128),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginSchema>;

export const UpdateProfileSchema = z
  .object({
    fullName: nameSchema.optional(),
    locale: localeSchema.optional(),
  })
  .strict();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'required' }).max(128),
    newPassword: passwordSchema,
  })
  .strict();
export type ChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

export const CreateInvitationSchema = z
  .object({
    email: emailSchema,
    role: z.enum(['HEAD_OF_SALES', 'MANAGER']),
  })
  .strict();
export type CreateInvitationRequest = z.infer<typeof CreateInvitationSchema>;

export const AcceptInvitationSchema = z
  .object({
    token: z.string().min(20).max(100),
    fullName: nameSchema,
    password: passwordSchema,
  })
  .strict();
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationSchema>;

export const ChangeRoleSchema = z.object({ role: z.enum(['HEAD_OF_SALES', 'MANAGER']) }).strict();
export type ChangeRoleRequest = z.infer<typeof ChangeRoleSchema>;

export const UpdateOrganizationSchema = z
  .object({
    name: nameSchema.optional(),
    aiExternalProcessingEnabled: z.boolean().optional(),
  })
  .strict();
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationSchema>;

export const CreateApiKeySchema = z
  .object({ name: z.string().trim().min(2, { message: 'too_short' }).max(50) })
  .strict();
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>;

export interface MeResponse {
  user: { id: string; email: string; fullName: string; locale: Locale };
  organization: {
    id: string;
    name: string;
    isDemo: boolean;
    aiExternalProcessingEnabled: boolean;
    timezone: string;
  };
  role: Role;
  permissions: Permission[];
  features: FeatureFlags;
  serverTime: string;
}

export interface MemberDto {
  id: string;
  userId: string;
  fullName: string;
  email?: string;
  role: Role;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt?: string;
  openLeads?: number;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: Role;
  invitedBy: { id: string; fullName: string } | null;
  expiresAt: string;
  createdAt: string;
}

export interface CreatedInvitationDto extends InvitationDto {
  inviteUrl: string;
}

export interface InvitationPreviewDto {
  organizationName: string;
  role: Role;
}

export interface OrganizationDto {
  id: string;
  name: string;
  timezone: string;
  isDemo: boolean;
  aiExternalProcessingEnabled: boolean;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedApiKeyDto extends ApiKeyDto {
  key: string;
}

export const roleSchema = z.enum(ROLES);

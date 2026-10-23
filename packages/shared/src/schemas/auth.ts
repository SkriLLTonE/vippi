import { z } from 'zod';
import type { Locale, Role } from '../enums.js';
import { INDUSTRY_PRESETS, ROLES } from '../enums.js';
import type { FeatureFlags } from '../features.js';
import type { Permission } from '../permissions.js';
import { emailSchema, localeSchema, passwordSchema } from './common.js';
import { IndustrySchema } from '../industries.js';
import { TIMEZONES } from '../timezones.js';
import { StatusLabelsSchema, type OrgLeadConfig, type OverridableStatus } from './org-config.js';

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
    /** ADR-025: seeds template fields and status labels; takes precedence over `industryPreset`. */
    industry: IndustrySchema.optional(),
    /** Legacy (ADR-024): REAL_ESTATE → REAL_ESTATE, GENERIC → OTHER. */
    industryPreset: z.enum(INDUSTRY_PRESETS).optional(),
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
    /** Notification email From address; null clears. Display name always uses organization name. */
    emailFrom: emailSchema.nullable().optional(),
    aiExternalProcessingEnabled: z.boolean().optional(),
    /** ADR-025: changes the industry only (fields are merged via `POST /organization/industry-template`). */
    industry: IndustrySchema.optional(),
    /** Legacy (ADR-024); ignored when `industry` is present. */
    industryPreset: z.enum(INDUSTRY_PRESETS).optional(),
    statusLabels: StatusLabelsSchema.optional(),
    /** Stored values outside the list stay readable (`OrganizationDto.timezone` is a plain string). */
    timezone: z.enum(TIMEZONES).optional(),
  })
  .strict();
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationSchema>;

/** ADR-025: switch industry and merge its template (adds missing fields, never removes). */
export const ApplyIndustryTemplateSchema = z
  .object({
    industry: IndustrySchema,
    /** Replace customized WON/LOST labels with the template ones. */
    overwriteStatusLabels: z.boolean().default(false),
  })
  .strict();
export type ApplyIndustryTemplateRequest = z.input<typeof ApplyIndustryTemplateSchema>;

export interface ApplyIndustryTemplateResponse {
  organization: OrganizationDto;
  addedFields: string[];
  skippedFields: string[];
  statusLabelsChanged: OverridableStatus[];
}

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
  } & OrgLeadConfig;
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

export interface OrganizationDto extends OrgLeadConfig {
  id: string;
  name: string;
  timezone: string;
  isDemo: boolean;
  /** Optional From address for notification emails; null => use SMTP_FROM address. */
  emailFrom: string | null;
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
  /** Last 3 characters of the key; null for keys created before encryption at rest. */
  last3: string | null;
  /** The full key is stored encrypted and can be revealed/copied (POST /api-keys/:id/reveal). */
  revealable: boolean;
}

export interface CreatedApiKeyDto extends ApiKeyDto {
  key: string;
}

export interface RevealedApiKeyDto {
  key: string;
}

export const roleSchema = z.enum(ROLES);

export const ROLES = ['OWNER', 'HEAD_OF_SALES', 'MANAGER'] as const;
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'DEACTIVATED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED'];

export const LOST_REASONS = [
  'NO_ANSWER',
  'TOO_EXPENSIVE',
  'BOUGHT_ELSEWHERE',
  'NOT_INTERESTED',
  'DUPLICATE',
  'SPAM',
  'OTHER',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];
export const SLA_EXEMPT_LOST_REASONS: readonly LostReason[] = ['DUPLICATE', 'SPAM'];

export const LEAD_SOURCES = [
  'INSTAGRAM',
  'TELEGRAM',
  'WEBSITE',
  'OLX',
  'PHONE',
  'WALK_IN',
  'REFERRAL',
  'OTHER',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_CREATED_VIA = ['MANUAL', 'CSV', 'API', 'SEED'] as const;
export type LeadCreatedVia = (typeof LEAD_CREATED_VIA)[number];

export const SLA_STATES = ['PENDING', 'MET', 'BREACHED', 'EXEMPT'] as const;
export type SlaState = (typeof SLA_STATES)[number];

export const CONTACT_CHANNELS = ['CALL', 'TELEGRAM', 'INSTAGRAM', 'WHATSAPP', 'SMS', 'EMAIL', 'OTHER'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CURRENCIES = ['UZS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PROPERTY_TYPES = ['APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND', 'OTHER'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const ACTIVITY_TYPES = [
  'CREATED',
  'ASSIGNED',
  'UNASSIGNED',
  'STATUS_CHANGED',
  'FIRST_CONTACT',
  'COMMENT',
  'SLA_BREACHED',
  'FIELDS_UPDATED',
  'AI_ANALYSIS_GENERATED',
  'AI_DRAFT_SENT',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_TYPES = ['SLA_BREACHED', 'LEAD_ASSIGNED'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const AI_INSIGHT_KINDS = ['LEAD_ANALYSIS', 'REPLY_DRAFT', 'WEEKLY_SUMMARY'] as const;
export type AiInsightKind = (typeof AI_INSIGHT_KINDS)[number];

export const AI_PROVIDER_NAMES = ['GEMINI', 'RULE_BASED'] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

export const AI_FALLBACK_REASONS = [
  'NO_PROVIDER_CONFIGURED',
  'ORG_DISABLED',
  'LIMIT_EXCEEDED',
  'INPUT_TOO_LONG',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'INVALID_OUTPUT',
] as const;
export type AiFallbackReason = (typeof AI_FALLBACK_REASONS)[number];

export const AUDIT_ACTOR_TYPES = ['USER', 'API_KEY', 'SYSTEM'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_ACTIONS = [
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'ORG_REGISTERED',
  'ORG_SETTINGS_UPDATED',
  'ORG_AI_PROCESSING_TOGGLED',
  'INVITATION_CREATED',
  'INVITATION_REVOKED',
  'INVITATION_ACCEPTED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_DEACTIVATED',
  'PASSWORD_CHANGED',
  'SLA_POLICY_UPDATED',
  'API_KEY_CREATED',
  'API_KEY_REVOKED',
  'CSV_IMPORTED',
  'LEADS_EXPORTED',
  'LEAD_DELETED',
  'LEAD_REASSIGNED',
  'ORG_INDUSTRY_PRESET_CHANGED',
  'LEAD_FIELDS_UPDATED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const LOCALES = ['ru', 'uz'] as const;
export type Locale = (typeof LOCALES)[number];

export const REPLY_TONES = ['FORMAL', 'FRIENDLY'] as const;
export type ReplyTone = (typeof REPLY_TONES)[number];

export const ORG_TIMEZONE = 'Asia/Tashkent';

/** Industry preset of an organization (ADR-024): only changes visible lead fields and AI prompts. */
export const INDUSTRY_PRESETS = ['REAL_ESTATE', 'GENERIC'] as const;
export type IndustryPreset = (typeof INDUSTRY_PRESETS)[number];

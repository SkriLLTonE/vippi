import type { Role } from './enums.js';

export const PERMISSIONS = [
  'lead.read',
  'lead.readAll',
  'lead.create',
  'lead.editAny',
  'lead.assign',
  'lead.take',
  'lead.reopen',
  'lead.delete',
  'lead.import',
  'lead.export',
  'dashboard.read',
  'member.read',
  'member.manage',
  'invitation.manage',
  'invitation.createHeadOfSales',
  'sla.manage',
  'apiKey.manage',
  'org.read',
  'org.manage',
  'ai.use',
  'ai.statusRead',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  HEAD_OF_SALES: [
    'lead.read',
    'lead.readAll',
    'lead.create',
    'lead.editAny',
    'lead.assign',
    'lead.reopen',
    'lead.import',
    'lead.export',
    'dashboard.read',
    'member.read',
    'invitation.manage',
    'sla.manage',
    'org.read',
    'ai.use',
    'ai.statusRead',
  ],
  MANAGER: ['lead.read', 'lead.create', 'lead.take', 'lead.export', 'member.read', 'org.read', 'ai.use'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function invitableRoles(role: Role): Role[] {
  if (role === 'OWNER') return ['HEAD_OF_SALES', 'MANAGER'];
  if (role === 'HEAD_OF_SALES') return ['MANAGER'];
  return [];
}

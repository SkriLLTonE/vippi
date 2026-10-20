import type { Role } from '@vippi/shared';

export interface Actor {
  userId: string;
  orgId: string;
  role: Role;
  sessionId: string;
  fullName: string;
}

export interface ApiKeyActor {
  apiKeyId: string;
  orgId: string;
}

export interface RequestWithActor {
  actor?: Actor;
  apiKeyActor?: ApiKeyActor;
}

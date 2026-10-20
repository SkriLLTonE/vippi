import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { withTenantGuard } from './tenant-guard.js';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Raw client without tenant guard. Only for system jobs and pre-authentication lookups. */
  readonly system: PrismaClient;
  /** Tenant-guarded client: every tenant model query must contain organizationId. */
  readonly db: PrismaClient;

  constructor() {
    this.system = new PrismaClient();
    this.db = withTenantGuard(this.system);
  }

  async onModuleInit(): Promise<void> {
    await this.system.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.system.$disconnect();
  }

  async ping(timeoutMs = 2000): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('db ping timeout')), timeoutMs);
      });
      await Promise.race([this.system.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

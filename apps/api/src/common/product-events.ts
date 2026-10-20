import { Injectable, Logger } from '@nestjs/common';

/** PRD §23: product analytics events written to the structured log (no PII). */
@Injectable()
export class ProductEvents {
  private readonly logger = new Logger('ProductEvent');

  emit(event: string, ctx: { organizationId?: string; userId?: string }, props: Record<string, unknown> = {}): void {
    this.logger.log({ type: 'product_event', event, organizationId: ctx.organizationId, userId: ctx.userId, props });
  }
}

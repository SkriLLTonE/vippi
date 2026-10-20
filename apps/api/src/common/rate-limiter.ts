import { Injectable } from '@nestjs/common';
import { Clock } from './clock.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter (single API instance in MVP; SPEC §23 — Redis when scaling out).
 */
@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly clock: Clock) {}

  /** Returns 0 when allowed, otherwise seconds until the window resets. */
  hit(key: string, limit: number, windowMs: number): number {
    const now = this.clock.now().getTime();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (this.buckets.size > 50_000) this.sweep(now);
    if (bucket.count > limit) return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return 0;
  }

  reset(): void {
    this.buckets.clear();
  }

  private sweep(now: number): void {
    for (const [key, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(key);
  }
}

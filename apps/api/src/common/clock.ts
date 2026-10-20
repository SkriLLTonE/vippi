import { Injectable } from '@nestjs/common';

/** Time source; replaced in tests to make SLA and analytics deterministic. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}

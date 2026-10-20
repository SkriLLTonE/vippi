import { ParseUUIDPipe } from '@nestjs/common';
import { notFound } from './app-exception.js';

/** Unknown/malformed IDs are answered with 404 like foreign IDs (SEC-007). */
export const UuidParam = new ParseUUIDPipe({ exceptionFactory: () => notFound() });

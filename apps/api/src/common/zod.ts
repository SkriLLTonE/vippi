import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import type { ApiErrorDetail } from '@vippi/shared';
import { AppException } from './app-exception.js';

export function zodIssuesToDetails(error: z.ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => {
    const custom = /^[a-z_]+$/.test(issue.message) ? issue.message : null;
    return {
      path: issue.path.map(String).join('.'),
      code: custom ?? issue.code,
      message: issue.message,
    };
  });
}

/** Validates and transforms request input with a shared Zod schema (SPEC §3.3 plan B). */
@Injectable()
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppException(400, 'VALIDATION_FAILED', 'Request validation failed', zodIssuesToDetails(result.error));
    }
    return result.data;
  }
}

export function toOpenApiSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  } catch {
    return { type: 'object' };
  }
}

/** Documents a Zod request body in OpenAPI. */
export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: toOpenApiSchema(schema) });

/** Documents query params of a Zod object schema in OpenAPI. */
export function ApiZodQuery(schema: z.ZodType): MethodDecorator {
  const json = toOpenApiSchema(schema);
  const props = (json.properties ?? {}) as Record<string, Record<string, unknown>>;
  const decorators = Object.entries(props).map(([name, s]) =>
    ApiQuery({ name, required: false, schema: s as Record<string, never> }),
  );
  return (target, key, descriptor) => {
    for (const d of decorators) d(target, key, descriptor);
  };
}

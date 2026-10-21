import type { z } from 'zod';

import { unprocessable } from './errors';

export function parseWith<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message = 'Invalid request parameters',
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : 'form';
    fields[key] ??= issue.message;
  }
  throw unprocessable(message, fields);
}

export function parseUuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw unprocessable('Invalid identifier format', { [field]: 'Invalid identifier' });
  }
  return value;
}

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/** A required secret/string that must not be empty or the placeholder `-`. */
const requiredSecret = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .trim()
    .min(1, `${name} must not be empty`)
    .refine((value) => value !== '-', `${name} must not be the placeholder '-'`);

const EnvSchema = z.object({
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  MCP_TOKEN: requiredSecret('MCP_TOKEN'),
  API_BASE_URL: requiredSecret('API_BASE_URL').refine(
    (value) => /^https?:\/\//.test(value),
    'API_BASE_URL must be an absolute http(s) URL',
  ),
  ADMIN_USERNAME: requiredSecret('ADMIN_USERNAME'),
  ADMIN_PASSWORD: requiredSecret('ADMIN_PASSWORD'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate `process.env` once at boot.
 * Throws a readable aggregated error when any required value is missing or invalid.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid MCP environment configuration:\n${issues}`);
  }
  // API_BASE_URL is normalized without a trailing slash so callers can append paths.
  return { ...result.data, API_BASE_URL: result.data.API_BASE_URL.replace(/\/+$/, '') };
}

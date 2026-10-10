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
  // This server's own scoped API token (gwj_…). Preferred: without it, the
  // admin username/password below are used instead.
  GWJ_API_TOKEN: requiredSecret('GWJ_API_TOKEN').optional(),
  ADMIN_USERNAME: requiredSecret('ADMIN_USERNAME').optional(),
  ADMIN_PASSWORD: requiredSecret('ADMIN_PASSWORD').optional(),
  // The git SHA of the running release, stamped into the task definition by the
  // deploy (absent locally). Reported by /healthz.
  GWJ_RELEASE: z.string().trim().min(1).optional(),
});

const CredentialedEnvSchema = EnvSchema.refine(
  (env) => Boolean(env.GWJ_API_TOKEN) || Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD),
  {
    message: 'Set GWJ_API_TOKEN (preferred) or both ADMIN_USERNAME and ADMIN_PASSWORD',
    path: ['GWJ_API_TOKEN'],
  },
);

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate `process.env` once at boot.
 * Throws a readable aggregated error when any required value is missing or invalid.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = CredentialedEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid MCP environment configuration:\n${issues}`);
  }
  // API_BASE_URL is normalized without a trailing slash so callers can append paths.
  return { ...result.data, API_BASE_URL: result.data.API_BASE_URL.replace(/\/+$/, '') };
}

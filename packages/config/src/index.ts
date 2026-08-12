import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // API Gateway Settings
  PORT: z.coerce.number().default(3000),
  GATEWAY_URL: z.string().url().default('http://localhost:3000'),

  // Auth Service Settings
  AUTH_SERVICE_PORT: z.coerce.number().default(3001),
  JWT_SECRET: z.string().min(8).default('super-secret-jwt-key-change-in-production-123!'),
  JWT_EXPIRE_SECONDS: z.coerce.number().default(86400),

  // Automation Service Settings
  AUTOMATION_SERVICE_PORT: z.coerce.number().default(3002),
  SQLITE_DB_PATH: z.string().default('./data/automation-os.sqlite'),

  // Artifact Storage Settings
  ARTIFACT_SERVICE_PORT: z.coerce.number().default(3003),
  ARTIFACT_STORAGE_DIR: z.string().default('./data/artifacts'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50),

  // Redis / Queue Settings
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // Security Policy Settings
  ALLOWED_BROWSER_DOMAINS: z.string().default('*.github.com,*.google.com,localhost'),
  ALLOWED_FILE_DIRECTORIES: z.string().default('/tmp/automation-os'),

  // Execution Agent Registration Token
  AGENT_REGISTRATION_TOKEN: z.string().default('agent-auth-shared-token-0987654321'),

  // Mock Adapter Trigger
  USE_MOCK_ADAPTER: z.coerce.boolean().default(false),
});

export type SystemConfig = z.infer<typeof ConfigSchema>;

/**
 * Loads and validates environment variables.
 * Falls back to process.env.
 */
export function loadConfig(customEnv?: Record<string, string>): SystemConfig {
  const source = customEnv || (process.env as Record<string, string>);

  // Custom boolean parsing helper for USE_MOCK_ADAPTER since coerce.boolean turns "false" into true in JS
  let mockAdapterBool: boolean | undefined;
  if (source.USE_MOCK_ADAPTER !== undefined) {
    mockAdapterBool = source.USE_MOCK_ADAPTER === 'true' || source.USE_MOCK_ADAPTER === '1';
  }

  const parsed = ConfigSchema.safeParse({
    ...source,
    ...(mockAdapterBool !== undefined ? { USE_MOCK_ADAPTER: mockAdapterBool } : {}),
  });

  if (!parsed.success) {
    console.error('❌ Configuration validation failed:', parsed.error.format());
    throw new Error('Configuration validation failed');
  }

  return parsed.data;
}

// Global default config instance
export const config = loadConfig();

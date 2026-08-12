/**
 * Base Application Error
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = 'INTERNAL_ERROR', statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error for bad inputs
 */
export class ValidationError extends AppError {
  public readonly details?: Record<string, string[]>;

  constructor(message: string, details?: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 400);
    this.details = details;
  }
}

/**
 * Authentication failures (missing/invalid JWT, bad credentials)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

/**
 * Authorization failures (insufficient permissions, workspace mismatch)
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

/**
 * Resource not found (workflow, user, workspace, etc.)
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND_ERROR', 404);
  }
}

/**
 * Conflict state (resource already exists, version conflict)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT_ERROR', 409);
  }
}

/**
 * Operation timeout
 */
export class TimeoutError extends AppError {
  constructor(message = 'Operation timed out') {
    super(message, 'TIMEOUT_ERROR', 408);
  }
}

/**
 * Workflow execution flow errors
 */
export class ExecutionError extends AppError {
  constructor(message: string) {
    super(message, 'EXECUTION_ERROR', 500);
  }
}

/**
 * Adapter command execution errors (Playwright / Pywinauto failures)
 */
export class AdapterError extends AppError {
  constructor(message: string) {
    super(message, 'ADAPTER_ERROR', 502);
  }
}

/**
 * Post-step state verification failures
 */
export class VerificationError extends AppError {
  constructor(message: string) {
    super(message, 'VERIFICATION_ERROR', 512);
  }
}

/**
 * Simple Logger Helper (Structured JSON Logging)
 */
export class StructuredLogger {
  constructor(private context: string) {}

  public info(message: string, metadata?: Record<string, string | number | boolean>): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        context: this.context,
        message,
        ...metadata,
      }),
    );
  }

  public warn(message: string, metadata?: Record<string, string | number | boolean>): void {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        context: this.context,
        message,
        ...metadata,
      }),
    );
  }

  public error(message: string, error?: Error, metadata?: Record<string, string | number | boolean>): void {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        context: this.context,
        message,
        error: error ? { message: error.message, stack: error.stack } : undefined,
        ...metadata,
      }),
    );
  }
}

/**
 * Redacts known sensitive strings from target text
 */
export function redactSecrets(text: string, secrets: string[]): string {
  let redacted = text;
  for (const secret of secrets) {
    if (!secret || secret.trim().length < 3) continue;
    // Escape regex characters
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    redacted = redacted.replace(regex, '[REDACTED]');
  }
  return redacted;
}

/**
 * Redacts common sensitive patterns (tokens, keys, passwords)
 */
export function redactKeys(text: string): string {
  // Simple regex for common secret patterns, like Bearer tokens, passwords, authorization headers
  let redacted = text;
  const patterns = [
    /(password["']?\s*:\s*["'])([^"']+)(["'])/gi,
    /(token["']?\s*:\s*["'])([^"']+)(["'])/gi,
    /(bearer\s+)([A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)/gi,
    /(authorization["']?\s*:\s*["'])([^"']+)(["'])/gi,
    /(key["']?\s*:\s*["'])([^"']+)(["'])/gi,
  ];

  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, (_, prefix, _secret, suffix) => {
      return `${prefix}[REDACTED]${suffix}`;
    });
  }
  return redacted;
}

/**
 * Generates a standard cryptographically random request/execution ID
 */
export function generateId(prefix = 'id'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 12; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${rand}`;
}

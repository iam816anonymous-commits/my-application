import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '@automation-os/config';
import { AuthenticationError } from '@automation-os/shared-utils';

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LEN = 64;
const PBKDF2_DIGEST = 'sha512';

/**
 * Checks if a password complies with password policy guidelines.
 * - At least 8 characters
 * - Contains at least one uppercase letter
 * - Contains at least one lowercase letter
 * - Contains at least one number
 * - Contains at least one symbol/special character
 */
export function validatePasswordPolicy(password: string): boolean {
  if (password.length < 8) return false;

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return hasUpper && hasLower && hasDigit && hasSpecial;
}

/**
 * Hashes a password using PBKDF2 with a random salt.
 * Returns the hash in 'salt:hash' format.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Compares a password against a stored 'salt:hash' value using timing-safe comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, hash] = parts;
  const computedHash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST).toString('hex');

  const computedBuf = Buffer.from(computedHash, 'hex');
  const storedBuf = Buffer.from(hash, 'hex');

  if (computedBuf.length !== storedBuf.length) return false;
  return timingSafeEqual(computedBuf, storedBuf);
}

export interface TokenPayload {
  userId: string;
  email: string;
  workspaces: string[];
}

/**
 * Generates a signed JWT token containing user context.
 */
export function generateToken(payload: TokenPayload, expiresInSeconds = config.JWT_EXPIRE_SECONDS): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Decodes and validates a JWT token.
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    if (!decoded.userId || !decoded.email || !Array.isArray(decoded.workspaces)) {
      throw new AuthenticationError('Invalid token payload structure');
    }
    return {
      userId: decoded.userId,
      email: decoded.email,
      workspaces: decoded.workspaces,
    };
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    throw new AuthenticationError('Token validation failed');
  }
}

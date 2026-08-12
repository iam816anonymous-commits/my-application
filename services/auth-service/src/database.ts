import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import { config } from '@automation-os/config';
import { StructuredLogger } from '@automation-os/shared-utils';

const logger = new StructuredLogger('DatabaseService');

export class DatabaseService {
  private db: any; // Type-ignored reference to native DatabaseSync

  constructor(private dbPath: string = config.SQLITE_DB_PATH) {}

  public initialize(): void {
    logger.info(`Initializing SQLite database...`, { dbPath: this.dbPath });

    if (this.dbPath !== ':memory:') {
      try {
        const dir = dirname(this.dbPath);
        mkdirSync(dir, { recursive: true });
      } catch (err: unknown) {
        logger.error(`Failed to create database directory`, err as Error);
      }
    }

    try {
      this.db = new DatabaseSync(this.dbPath);
      this.createTables();
      logger.info('Database tables created and verified successfully.');
    } catch (err: unknown) {
      logger.error('Failed to initialize database', err as Error);
      throw err;
    }
  }

  private createTables(): void {
    // Enable foreign keys
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Users Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Workspaces Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Workspace Memberships Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_memberships (
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, user_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  /**
   * Executes a statement with parameters (INSERT, UPDATE, DELETE)
   */
  public run(sql: string, params: (string | number | boolean | null)[]): void {
    const stmt = this.db.prepare(sql);
    stmt.run(...params);
  }

  /**
   * Queries multiple rows
   */
  public query<T>(sql: string, params: (string | number | boolean | null)[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  /**
   * Queries a single row
   */
  public queryOne<T>(sql: string, params: (string | number | boolean | null)[] = []): T | null {
    const rows = this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Clears all tables (used for testing isolation)
   */
  public clearAllTables(): void {
    if (this.dbPath !== ':memory:' && config.NODE_ENV !== 'test') {
      throw new Error('clearAllTables is only permitted in test environments.');
    }
    this.db.exec('PRAGMA foreign_keys = OFF;');
    this.db.exec('DELETE FROM workspace_memberships;');
    this.db.exec('DELETE FROM workspaces;');
    this.db.exec('DELETE FROM users;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  /**
   * Closes the database session
   */
  public close(): void {
    if (this.db) {
      // Native close is done automatically or if supported
      this.db = null;
    }
  }
}

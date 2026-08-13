import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import { config } from '@automation-os/config';
import { StructuredLogger } from '@automation-os/shared-utils';

const logger = new StructuredLogger('AutomationDatabaseService');

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
      logger.info('Automation database tables created and verified successfully.');
    } catch (err: unknown) {
      logger.error('Failed to initialize database', err as Error);
      throw err;
    }
  }

  private createTables(): void {
    // Enable foreign keys
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Workflows Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        target_application_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        tags TEXT NOT NULL, -- Stored as JSON serialized array of strings
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Workflow Versions Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_versions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_by_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );
    `);

    // Workflow Steps Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id TEXT PRIMARY KEY,
        workflow_version_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        adapter_preference TEXT,
        timeout_ms INTEGER NOT NULL,
        retries INTEGER NOT NULL,
        preconditions TEXT NOT NULL, -- Stored as JSON serialized array of strings
        failure_policy TEXT NOT NULL,
        parameters TEXT NOT NULL, -- Stored as JSON serialized object
        FOREIGN KEY (workflow_version_id) REFERENCES workflow_versions(id) ON DELETE CASCADE
      );
    `);

    // Creating indexes for rapid lookup performance on workspace/workflow lookups
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows(workspace_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON workflow_versions(workflow_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_steps_version ON workflow_steps(workflow_version_id);');
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
    this.db.exec('DELETE FROM workflow_steps;');
    this.db.exec('DELETE FROM workflow_versions;');
    this.db.exec('DELETE FROM workflows;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  /**
   * Closes the database session
   */
  public close(): void {
    if (this.db) {
      this.db = null;
    }
  }
}

import { User, Workspace, WorkspaceMembership } from '@automation-os/shared-types';
import { DatabaseService } from './database.js';

interface SqliteUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface SqliteWorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface SqliteMembershipRow {
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export class UserRepository {
  constructor(private db: DatabaseService) {}

  public async findByEmail(email: string): Promise<User | null> {
    const row = this.db.queryOne<SqliteUserRow>(
      'SELECT id, email, password_hash, name, created_at, updated_at FROM users WHERE email = ?',
      [email.toLowerCase()],
    );
    return row ? this.mapUserRow(row) : null;
  }

  public async findById(id: string): Promise<User | null> {
    const row = this.db.queryOne<SqliteUserRow>(
      'SELECT id, email, password_hash, name, created_at, updated_at FROM users WHERE id = ?',
      [id],
    );
    return row ? this.mapUserRow(row) : null;
  }

  public async create(user: User): Promise<void> {
    this.db.run(
      'INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        user.id,
        user.email.toLowerCase(),
        user.passwordHash,
        user.name,
        user.createdAt.toISOString(),
        user.updatedAt.toISOString(),
      ],
    );
  }

  private mapUserRow(row: SqliteUserRow): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export class WorkspaceRepository {
  constructor(private db: DatabaseService) {}

  public async findById(id: string): Promise<Workspace | null> {
    const row = this.db.queryOne<SqliteWorkspaceRow>(
      'SELECT id, name, owner_id, created_at, updated_at FROM workspaces WHERE id = ?',
      [id],
    );
    return row ? this.mapWorkspaceRow(row) : null;
  }

  public async create(workspace: Workspace): Promise<void> {
    this.db.run(
      'INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [
        workspace.id,
        workspace.name,
        workspace.ownerId,
        workspace.createdAt.toISOString(),
        workspace.updatedAt.toISOString(),
      ],
    );
  }

  public async listByUserId(userId: string): Promise<Workspace[]> {
    const rows = this.db.query<SqliteWorkspaceRow>(
      `SELECT w.id, w.name, w.owner_id, w.created_at, w.updated_at
       FROM workspaces w
       LEFT JOIN workspace_memberships m ON w.id = m.workspace_id
       WHERE w.owner_id = ? OR m.user_id = ?
       GROUP BY w.id`,
      [userId, userId],
    );
    return rows.map(this.mapWorkspaceRow);
  }

  public async createMembership(membership: WorkspaceMembership): Promise<void> {
    this.db.run(
      'INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
      [
        membership.workspaceId,
        membership.userId,
        membership.role,
        membership.createdAt.toISOString(),
      ],
    );
  }

  public async getMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    const row = this.db.queryOne<SqliteMembershipRow>(
      'SELECT workspace_id, user_id, role, created_at FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId],
    );
    return row ? this.mapMembershipRow(row) : null;
  }

  public async listMembershipsByWorkspaceId(workspaceId: string): Promise<WorkspaceMembership[]> {
    const rows = this.db.query<SqliteMembershipRow>(
      'SELECT workspace_id, user_id, role, created_at FROM workspace_memberships WHERE workspace_id = ?',
      [workspaceId],
    );
    return rows.map(this.mapMembershipRow);
  }

  private mapWorkspaceRow(row: SqliteWorkspaceRow): Workspace {
    return {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapMembershipRow(row: SqliteMembershipRow): WorkspaceMembership {
    return {
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role as 'owner' | 'admin' | 'member',
      createdAt: new Date(row.created_at),
    };
  }
}

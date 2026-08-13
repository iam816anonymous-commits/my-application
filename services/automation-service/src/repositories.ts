import { Workflow, WorkflowVersion, WorkflowStep } from '@automation-os/shared-types';
import { DatabaseService } from './database.js';

interface SqliteWorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: string;
  owner_id: string;
  target_application_id: string;
  environment: string;
  tags: string; // JSON serialized string array
  created_at: string;
  updated_at: string;
}

interface SqliteVersionRow {
  id: string;
  workflow_id: string;
  version_number: number;
  status: string;
  created_by_id: string;
  created_at: string;
}

interface SqliteStepRow {
  id: string;
  workflow_version_id: string;
  step_order: number;
  action: string;
  target: string;
  adapter_preference: string | null;
  timeout_ms: number;
  retries: number;
  preconditions: string; // JSON serialized string array
  failure_policy: string;
  parameters: string; // JSON serialized object
}

export class WorkflowRepository {
  constructor(private db: DatabaseService) {}

  public async create(workflow: Workflow): Promise<void> {
    this.db.run(
      `INSERT INTO workflows (id, workspace_id, name, description, status, owner_id, target_application_id, environment, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workflow.id,
        workflow.workspaceId,
        workflow.name,
        workflow.description,
        workflow.status,
        workflow.ownerId,
        workflow.targetApplicationId,
        workflow.environment,
        JSON.stringify(workflow.tags),
        workflow.createdAt.toISOString(),
        workflow.updatedAt.toISOString(),
      ],
    );
  }

  public async findById(id: string): Promise<Workflow | null> {
    const row = this.db.queryOne<SqliteWorkflowRow>(
      'SELECT id, workspace_id, name, description, status, owner_id, target_application_id, environment, tags, created_at, updated_at FROM workflows WHERE id = ?',
      [id],
    );
    return row ? this.mapWorkflowRow(row) : null;
  }

  public async listByWorkspace(workspaceId: string): Promise<Workflow[]> {
    const rows = this.db.query<SqliteWorkflowRow>(
      'SELECT id, workspace_id, name, description, status, owner_id, target_application_id, environment, tags, created_at, updated_at FROM workflows WHERE workspace_id = ?',
      [workspaceId],
    );
    return rows.map(this.mapWorkflowRow);
  }

  public async update(workflow: Workflow): Promise<void> {
    this.db.run(
      `UPDATE workflows
       SET name = ?, description = ?, status = ?, target_application_id = ?, environment = ?, tags = ?, updated_at = ?
       WHERE id = ?`,
      [
        workflow.name,
        workflow.description,
        workflow.status,
        workflow.targetApplicationId,
        workflow.environment,
        JSON.stringify(workflow.tags),
        workflow.updatedAt.toISOString(),
        workflow.id,
      ],
    );
  }

  public async delete(id: string): Promise<void> {
    this.db.run('DELETE FROM workflows WHERE id = ?', [id]);
  }

  private mapWorkflowRow(row: SqliteWorkflowRow): Workflow {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      description: row.description,
      status: row.status as 'draft' | 'published' | 'archived',
      ownerId: row.owner_id,
      targetApplicationId: row.target_application_id,
      environment: row.environment,
      tags: JSON.parse(row.tags) as string[],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export class WorkflowVersionRepository {
  constructor(private db: DatabaseService) {}

  public async create(version: WorkflowVersion): Promise<void> {
    this.db.run(
      'INSERT INTO workflow_versions (id, workflow_id, version_number, status, created_by_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        version.id,
        version.workflowId,
        version.versionNumber,
        version.status,
        version.createdById,
        version.createdAt.toISOString(),
      ],
    );

    // Batch insert steps
    for (const step of version.steps) {
      await this.createStep(step);
    }
  }

  public async findById(id: string): Promise<WorkflowVersion | null> {
    const row = this.db.queryOne<SqliteVersionRow>(
      'SELECT id, workflow_id, version_number, status, created_by_id, created_at FROM workflow_versions WHERE id = ?',
      [id],
    );
    if (!row) return null;

    const steps = await this.getStepsByVersionId(id);
    return this.mapVersionRow(row, steps);
  }

  public async getLatestByWorkflowId(workflowId: string): Promise<WorkflowVersion | null> {
    const row = this.db.queryOne<SqliteVersionRow>(
      `SELECT id, workflow_id, version_number, status, created_by_id, created_at
       FROM workflow_versions
       WHERE workflow_id = ?
       ORDER BY version_number DESC LIMIT 1`,
      [workflowId],
    );
    if (!row) return null;

    const steps = await this.getStepsByVersionId(row.id);
    return this.mapVersionRow(row, steps);
  }

  public async listByWorkflowId(workflowId: string): Promise<WorkflowVersion[]> {
    const rows = this.db.query<SqliteVersionRow>(
      'SELECT id, workflow_id, version_number, status, created_by_id, created_at FROM workflow_versions WHERE workflow_id = ? ORDER BY version_number DESC',
      [workflowId],
    );

    const versions: WorkflowVersion[] = [];
    for (const r of rows) {
      const steps = await this.getStepsByVersionId(r.id);
      versions.push(this.mapVersionRow(r, steps));
    }
    return versions;
  }

  public async createStep(step: WorkflowStep): Promise<void> {
    this.db.run(
      `INSERT INTO workflow_steps (id, workflow_version_id, step_order, action, target, adapter_preference, timeout_ms, retries, preconditions, failure_policy, parameters)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        step.id,
        step.workflowVersionId,
        step.order,
        step.action,
        step.target,
        step.adapterPreference || null,
        step.timeoutMs,
        step.retries,
        JSON.stringify(step.preconditions),
        step.failurePolicy,
        JSON.stringify(step.parameters),
      ],
    );
  }

  public async getStepsByVersionId(versionId: string): Promise<WorkflowStep[]> {
    const rows = this.db.query<SqliteStepRow>(
      `SELECT id, workflow_version_id, step_order, action, target, adapter_preference, timeout_ms, retries, preconditions, failure_policy, parameters
       FROM workflow_steps
       WHERE workflow_version_id = ?
       ORDER BY step_order ASC`,
      [versionId],
    );
    return rows.map(this.mapStepRow);
  }

  private mapVersionRow(row: SqliteVersionRow, steps: WorkflowStep[]): WorkflowVersion {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      versionNumber: row.version_number,
      steps,
      status: row.status as 'draft' | 'published',
      createdById: row.created_by_id,
      createdAt: new Date(row.created_at),
    };
  }

  private mapStepRow(row: SqliteStepRow): WorkflowStep {
    return {
      id: row.id,
      workflowVersionId: row.workflow_version_id,
      order: row.step_order,
      action: row.action as WorkflowStep['action'],
      target: row.target,
      adapterPreference: row.adapter_preference || undefined,
      timeoutMs: row.timeout_ms,
      retries: row.retries,
      preconditions: JSON.parse(row.preconditions) as string[],
      failurePolicy: row.failure_policy as 'fail' | 'retry' | 'ignore' | 'recover',
      parameters: JSON.parse(row.parameters) as Record<string, string | number | boolean>,
    };
  }
}

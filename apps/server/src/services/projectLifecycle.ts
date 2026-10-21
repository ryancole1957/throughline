import type { ProjectStage } from '@throughline/shared';
import { PROJECT_STAGES, SIGNOFF_ROLES, nextProjectStage } from '@throughline/shared';

import type { AppDatabase } from '../db';
import type { ProjectRecord } from '../domain/access';
import { conflict } from '../lib/errors';
import { recordEvent } from '../data/events';

const stageLabels: Record<ProjectStage, string> = {
  draft: 'Draft',
  scope: 'Scope',
  collection: 'Collection',
  walkthrough: 'Walkthrough',
  verification: 'Verification',
  signoff: 'Sign-off',
  closed: 'Closed',
};

function stageIndex(stage: ProjectStage): number {
  return PROJECT_STAGES.indexOf(stage);
}

function markMilestonesThrough(
  db: AppDatabase,
  projectId: string,
  stage: ProjectStage,
  timestamp: string,
): void {
  const stages = PROJECT_STAGES.slice(0, stageIndex(stage) + 1);
  if (!stages.length) return;
  const placeholders = stages.map(() => '?').join(', ');
  db.prepare(`
    UPDATE project_milestones
    SET completed_at = COALESCE(completed_at, ?)
    WHERE project_id = ? AND stage IN (${placeholders})
  `).run(timestamp, projectId, ...stages);
}

function clearMilestonesFrom(
  db: AppDatabase,
  projectId: string,
  stage: ProjectStage,
): void {
  const stages = PROJECT_STAGES.slice(stageIndex(stage));
  const placeholders = stages.map(() => '?').join(', ');
  db.prepare(`
    UPDATE project_milestones SET completed_at = NULL
    WHERE project_id = ? AND stage IN (${placeholders})
  `).run(projectId, ...stages);
}

function updateProjectStage(
  db: AppDatabase,
  projectId: string,
  stage: ProjectStage,
  timestamp: string,
  closedAt: string | null,
): void {
  db.prepare(`
    UPDATE projects SET stage = ?, status = 'active', closed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(stage, closedAt, timestamp, projectId);
}

export function getProjectById(db: AppDatabase, projectId: string): ProjectRecord {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | ProjectRecord
    | undefined;
  if (!project) throw new Error('project not found');
  return project;
}

export function pauseProject(db: AppDatabase, project: ProjectRecord, actorId: string): void {
  if (project.stage === 'closed') throw conflict('A closed project cannot be paused');
  if (project.status === 'paused') return;
  const timestamp = new Date().toISOString();
  db.prepare("UPDATE projects SET status = 'paused', updated_at = ? WHERE id = ?").run(
    timestamp,
    project.id,
  );
  recordEvent(db, {
    projectId: project.id,
    actorId,
    action: 'project.paused',
    detail: 'Project paused',
  });
}

export function resumeProject(db: AppDatabase, project: ProjectRecord, actorId: string): void {
  if (project.stage === 'closed') throw conflict('A closed project cannot be resumed');
  if (project.status === 'active') return;
  const timestamp = new Date().toISOString();
  db.prepare("UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?").run(
    timestamp,
    project.id,
  );
  recordEvent(db, {
    projectId: project.id,
    actorId,
    action: 'project.resumed',
    detail: 'Project resumed',
  });
}

export function advanceProject(db: AppDatabase, project: ProjectRecord, actorId: string): void {
  if (project.status === 'paused') throw conflict('Project is paused; resume it first');
  const next = nextProjectStage(project.stage);
  if (!next) {
    throw conflict('The project cannot advance further; record the delivery conclusion and complete sign-off first');
  }
  const timestamp = new Date().toISOString();
  markMilestonesThrough(db, project.id, project.stage, timestamp);
  updateProjectStage(db, project.id, next, timestamp, null);
  recordEvent(db, {
    projectId: project.id,
    actorId,
    action: 'project.stage.advanced',
    detail: `Project stage advanced to "${stageLabels[next]}"`,
  });
}

export function moveToSignoffAfterConclusion(
  db: AppDatabase,
  project: ProjectRecord,
  actorId: string,
): void {
  if (project.stage === 'signoff') return;
  if (project.stage === 'closed') throw conflict('Project is closed');
  const timestamp = new Date().toISOString();
  markMilestonesThrough(db, project.id, project.stage, timestamp);
  updateProjectStage(db, project.id, 'signoff', timestamp, null);
  recordEvent(db, {
    projectId: project.id,
    actorId,
    action: 'project.stage.signoff',
    detail: 'Delivery conclusion confirmed; project moved to Sign-off',
  });
}

export interface CloseCheckResult {
  closed: boolean;
  pendingRoles: string[];
  hasDisagreement: boolean;
}

export function maybeCloseProject(
  db: AppDatabase,
  projectId: string,
  actorId: string,
): CloseCheckResult {
  const project = getProjectById(db, projectId);
  if (project.stage !== 'signoff') {
    return { closed: false, pendingRoles: [], hasDisagreement: false };
  }
  const conclusion = db
    .prepare(
      'SELECT id FROM conclusions WHERE project_id = ? AND voided_at IS NULL LIMIT 1',
    )
    .get(projectId) as { id: string } | undefined;
  if (!conclusion) return { closed: false, pendingRoles: [...SIGNOFF_ROLES], hasDisagreement: false };

  const rows = db
    .prepare(
      'SELECT role, decision FROM signoffs WHERE project_id = ? AND voided_at IS NULL',
    )
    .all(projectId) as Array<{ role: string; decision: string }>;
  const byRole = new Map(rows.map((row) => [row.role, row.decision]));
  const pendingRoles = SIGNOFF_ROLES.filter((role) => !byRole.has(role));
  const hasDisagreement = rows.some((row) => row.decision === 'disagree');
  if (pendingRoles.length || hasDisagreement) {
    return { closed: false, pendingRoles, hasDisagreement };
  }

  const timestamp = new Date().toISOString();
  markMilestonesThrough(db, projectId, 'closed', timestamp);
  updateProjectStage(db, projectId, 'closed', timestamp, timestamp);
  recordEvent(db, {
    projectId,
    actorId,
    action: 'project.closed',
    detail: 'All responsible parties signed off; project closed',
  });
  return { closed: true, pendingRoles: [], hasDisagreement: false };
}

export function reopenProject(db: AppDatabase, project: ProjectRecord, actorId: string): void {
  if (project.stage !== 'signoff' && project.stage !== 'closed') {
    throw conflict('Only projects in Sign-off or Closed can be reopened');
  }
  const timestamp = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      "UPDATE signoffs SET voided_at = ? WHERE project_id = ? AND voided_at IS NULL",
    ).run(timestamp, project.id);
    db.prepare(
      "UPDATE conclusions SET voided_at = ? WHERE project_id = ? AND voided_at IS NULL",
    ).run(timestamp, project.id);
    clearMilestonesFrom(db, project.id, 'verification');
    updateProjectStage(db, project.id, 'verification', timestamp, null);
    recordEvent(db, {
      projectId: project.id,
      actorId,
      action: 'project.reopened',
      detail: 'Project reopened; previous conclusion and sign-offs voided; returned to Verification',
    });
  })();
}


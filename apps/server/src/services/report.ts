import type {
  AcceptanceStatus,
  Conclusion,
  ReportData,
  ReportDifference,
  ReportSignoff,
  SignoffDecision,
  SignoffRole,
  UserRef,
} from '@throughline/shared';
import { PROJECT_STAGES, SIGNOFF_ROLES } from '@throughline/shared';

import type { AppDatabase } from '../db';
import type { AuthUserRecord, ProjectAccess } from '../domain/access';
import { signoffRoleFor } from '../domain/access';
import { computeSnapshotHash, type SnapshotPayload } from '../domain/snapshot';
import { listConditions } from '../data/conditions';
import { listAllItemSummaries } from '../data/items';
import {
  getProjectDetail,
  getProjectStats,
  getSignoffMembers,
} from '../data/projects';
import { listRisks } from '../data/risks';
import { listSteps } from '../data/steps';
import { computeModules } from './overview';

interface ConclusionRow {
  id: string;
  decision: Conclusion['decision'];
  note: string;
  decided_at: string;
  userId: string;
  userName: string;
  userEmail: string;
  userTitle: string;
}

interface SignoffRow {
  id: string;
  role: SignoffRole;
  decision: SignoffDecision;
  note: string;
  snapshot_hash: string;
  signed_at: string;
  userId: string;
  userName: string;
  userEmail: string;
  userTitle: string;
}

interface DifferenceRow {
  itemId: string;
  code: string;
  title: string;
  status: AcceptanceStatus;
  remarks: string;
  environment: string;
  version: string;
  reference: string;
  createdAt: string;
  reviewerName: string;
}

function getActiveConclusion(db: AppDatabase, projectId: string): Conclusion | null {
  const row = db
    .prepare(`
      SELECT c.id, c.decision, c.note, c.decided_at, c.decided_by AS userId,
             u.name AS userName, u.email AS userEmail, u.title AS userTitle
      FROM conclusions c JOIN users u ON u.id = c.decided_by
      WHERE c.project_id = ? AND c.voided_at IS NULL
      ORDER BY c.decided_at DESC LIMIT 1
    `)
    .get(projectId) as ConclusionRow | undefined;
  if (!row) return null;
  return {
    decision: row.decision,
    note: row.note,
    decidedBy: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      title: row.userTitle,
    },
    decidedAt: row.decided_at,
  };
}

function getActiveSignoffs(db: AppDatabase, projectId: string): SignoffRow[] {
  return db
    .prepare(`
      SELECT s.id, s.role, s.decision, s.note, s.snapshot_hash, s.signed_at,
             s.user_id AS userId, u.name AS userName, u.email AS userEmail, u.title AS userTitle
      FROM signoffs s JOIN users u ON u.id = s.user_id
      WHERE s.project_id = ? AND s.voided_at IS NULL
      ORDER BY s.signed_at ASC
    `)
    .all(projectId) as SignoffRow[];
}

function buildSnapshot(
  db: AppDatabase,
  access: ProjectAccess,
  conclusion: Conclusion | null,
): SnapshotPayload {
  const items = listAllItemSummaries(db, access.project.id);
  const conditions = listConditions(db, access.project.id);
  const risks = listRisks(db, access.project.id);
  const steps = listSteps(db, access.project.id);
  return {
    project: {
      code: access.project.code,
      deadline: access.project.deadline,
      scope: access.project.scope,
    },
    conclusion: conclusion ? conclusion.decision : null,
    items: items.map((item) => ({
      code: item.code,
      revision: item.revision,
      supplyStatus: item.supplyStatus,
      acceptanceStatus: item.acceptanceStatus,
      evidenceCount: item.evidenceCount,
      coreDecision: item.latestCore?.decision ?? null,
      businessDecision: item.latestBusiness?.decision ?? null,
    })),
    conditions: conditions.map((condition) => ({
      code: condition.code,
      status: condition.status,
      severity: condition.severity,
      dueDate: condition.dueDate,
    })),
    risks: risks.map((risk) => ({
      code: risk.code,
      status: risk.status,
      severity: risk.severity,
      dueDate: risk.dueDate,
    })),
    steps: steps.map((step) => ({ position: step.position, status: step.status })),
  };
}

function buildDifferences(db: AppDatabase, projectId: string): ReportDifference[] {
  const items = listAllItemSummaries(db, projectId).filter((item) =>
    ['conditional', 'rejected', 'not_applicable'].includes(item.acceptanceStatus),
  );
  if (!items.length) return [];
  const rows = db
    .prepare(`
      SELECT a.item_id AS itemId, i.code, i.title, i.acceptance_status AS status,
             a.remarks, a.environment, a.version, a.reference, a.created_at AS createdAt,
             u.name AS reviewerName
      FROM acceptances a
      JOIN items i ON i.id = a.item_id
      JOIN users u ON u.id = a.reviewer_id
      WHERE i.project_id = ? AND a.revision = i.revision
      ORDER BY i.seq ASC, a.created_at ASC, a.rowid ASC
    `)
    .all(projectId) as DifferenceRow[];
  const latestByItem = new Map<string, DifferenceRow>();
  for (const row of rows) latestByItem.set(row.itemId, row);
  return items.map((item) => {
    const record = latestByItem.get(item.id);
    return {
      item: { id: item.id, code: item.code, title: item.title },
      acceptanceStatus: item.acceptanceStatus,
      reason: record?.remarks ?? '',
      environment: record?.environment ?? '',
      version: record?.version ?? '',
      reference: record?.reference ?? '',
      decidedBy: record?.reviewerName ?? '',
      decidedAt: record?.createdAt ?? '',
    };
  });
}

export function getCurrentSnapshotHash(db: AppDatabase, access: ProjectAccess): string {
  const conclusion = getActiveConclusion(db, access.project.id);
  return computeSnapshotHash(buildSnapshot(db, access, conclusion));
}

export function buildReport(
  db: AppDatabase,
  access: ProjectAccess,
  user: AuthUserRecord,
): ReportData {
  const project = getProjectDetail(db, access);
  const items = listAllItemSummaries(db, access.project.id);
  const risks = listRisks(db, access.project.id);
  const conditions = listConditions(db, access.project.id);
  const steps = listSteps(db, access.project.id);
  const conclusion = getActiveConclusion(db, access.project.id);
  const signoffRows = getActiveSignoffs(db, access.project.id);
  const stats = getProjectStats(db, access.project.id);
  const moduleTable = computeModules(items, risks);
  const currentSnapshotHash = getCurrentSnapshotHash(db, access);
  const members = getSignoffMembers(db, access.project.id);
  const role = signoffRoleFor(access.role);
  const ownSignoff = signoffRows.find((row) => row.userId === user.id);
  const canSignOff =
    project.status === 'active' &&
    project.stage === 'signoff' &&
    !!conclusion &&
    !!role &&
    !ownSignoff;

  const signoffs: ReportSignoff[] = SIGNOFF_ROLES.map((signoffRole) => {
    const row = signoffRows.find((signoff) => signoff.role === signoffRole);
    const member = members[signoffRole];
    const userRef: UserRef | null = row
      ? {
          id: row.userId,
          name: row.userName,
          email: row.userEmail,
          title: row.userTitle,
        }
      : member
        ? { id: member.userId, name: member.name, email: member.email, title: member.title }
        : null;
    return {
      role: signoffRole,
      member: userRef,
      decision: row?.decision ?? null,
      note: row?.note ?? '',
      signedAt: row?.signed_at ?? null,
      snapshotHash: row?.snapshot_hash ?? null,
      hashState: row ? (row.snapshot_hash === currentSnapshotHash ? 'current' : 'stale') : null,
    };
  });

  const passed = steps.filter((step) => step.status === 'passed').length;
  return {
    project,
    generatedAt: new Date().toISOString(),
    moduleTable,
    totals: {
      items: items.length,
      submitted: items.filter((item) => item.supplyStatus === 'submitted').length,
      settled: stats.settledItems,
      highRisks: stats.highRisks,
    },
    differences: buildDifferences(db, access.project.id),
    conditions,
    openRisks: risks.filter((risk) => risk.status !== 'closed'),
    scope: access.project.scope,
    e2e: { passed, total: steps.length },
    conclusion,
    signoffs,
    currentSnapshotHash,
    signoffRole: role,
    canSignOff,
  };
}

const stageLabels: Record<(typeof PROJECT_STAGES)[number], string> = {
  draft: 'Draft',
  scope: 'Scope',
  collection: 'Collection',
  walkthrough: 'Walkthrough',
  verification: 'Verification',
  signoff: 'Sign-off',
  closed: 'Closed',
};

const conclusionLabels = {
  accepted: 'Accepted',
  conditionally_accepted: 'Conditionally accepted',
  not_accepted: 'Not accepted',
} as const;

const roleLabels: Record<SignoffRole, string> = {
  delivery: 'Delivery',
  core_reviewer: 'Technical reviewer',
  business_reviewer: 'Business reviewer',
  receiver: 'Acceptance owner',
};

const decisionLabels: Record<SignoffDecision, string> = {
  agree: 'Agree',
  agree_with_reservations: 'Agree with reservations',
  disagree: 'Disagree',
};

const statusLabels: Record<string, string> = {
  pending_review: 'Pending review',
  in_verification: 'In verification',
  passed: 'Accepted',
  conditional: 'Conditional',
  rejected: 'Rejected',
  not_applicable: 'Not applicable',
  pending_submission: 'Awaiting submission',
  submitted: 'Submitted',
  needs_information: 'Needs information',
  open: 'Open',
  in_progress: 'In progress',
  escalated: 'Escalated',
  mitigated: 'Mitigated',
  closed: 'Closed',
};

const severityLabels = { high: 'High', medium: 'Medium', low: 'Low' } as const;

export function renderReportMarkdown(report: ReportData): string {
  const lines: string[] = [];
  const push = (line = '') => lines.push(line);
  const project = report.project;
  push(`# Delivery Report — ${project.name}`);
  push();
  push(`- Code: ${project.code}`);
  push(`- Client: ${project.client || '—'}`);
  push(`- Stage: ${stageLabels[project.stage]}${project.status === 'paused' ? ' (paused)' : ''}`);
  push(`- Deadline: ${project.deadline}`);
  push(`- Generated: ${report.generatedAt}`);
  push(
    `- Conclusion: ${
      report.conclusion ? conclusionLabels[report.conclusion.decision] : 'Not recorded'
    }${report.conclusion?.note ? ` (${report.conclusion.note})` : ''}`,
  );
  push();
  push('## 1. Completion snapshot');
  push();
  push('| Module | Items | Submitted | Settled | High risks |');
  push('| --- | --- | --- | --- | --- |');
  for (const module of report.moduleTable) {
    push(`| ${module.module} | ${module.total} | ${module.submitted} | ${module.settled} | ${module.highRisks} |`);
  }
  push(
    `| Total | ${report.totals.items} | ${report.totals.submitted} | ${report.totals.settled} | ${report.totals.highRisks} |`,
  );
  push();
  push('> Submission is not acceptance. Acceptance requires current reviews, business confirmation, and reproduction by the acceptance owner in an authorized environment.');
  push();
  push('## 2. Exceptions');
  push();
  if (report.differences.length) {
    for (const difference of report.differences) {
      const source =
        difference.environment || difference.version
          ? ` (source: ${difference.environment || '—'} · ${difference.version || '—'})`
          : '';
      push(
        `- ${difference.item.code} ${difference.item.title} [${statusLabels[difference.acceptanceStatus] ?? difference.acceptanceStatus}]${difference.reason ? `: ${difference.reason}` : ''}${source}`,
      );
    }
  } else {
    push('No exceptions.');
  }
  push();
  push('## 3. Open conditions');
  push();
  if (report.conditions.length) {
    for (const condition of report.conditions) {
      push(
        `- ${condition.code} ${condition.description} (owner ${condition.owner.name}, due ${condition.dueDate}, severity ${severityLabels[condition.severity]}, status ${condition.status === 'open' ? 'open' : 'closed'})`,
      );
    }
  } else {
    push('No conditions.');
  }
  push();
  push('## 4. Open risks');
  push();
  if (report.openRisks.length) {
    for (const risk of report.openRisks) {
      push(
        `- ${risk.code} [${severityLabels[risk.severity]}] ${risk.title} (${statusLabels[risk.status] ?? risk.status}, owner ${risk.owner.name}, due ${risk.dueDate})`,
      );
    }
  } else {
    push('No open risks.');
  }
  push();
  push('## 5. Scope not accepted');
  push();
  push(report.scope || '—');
  push();
  push('## 6. End-to-end verification');
  push();
  push(`${report.e2e.passed} of ${report.e2e.total} steps verified in an authorized test environment.`);
  push();
  push('## 7. Sign-offs');
  push();
  push(`Current report snapshot: ${report.currentSnapshotHash}`);
  for (const signoff of report.signoffs) {
    const signer = signoff.member
      ? `${signoff.member.name} (${roleLabels[signoff.role]})`
      : `${roleLabels[signoff.role]} (unassigned)`;
    if (signoff.decision) {
      push(
        `- ${signer}: ${decisionLabels[signoff.decision]}, snapshot ${signoff.snapshotHash} (${
          signoff.hashState === 'current' ? 'current' : 'changed'
        }), ${signoff.signedAt}${signoff.note ? `, note: ${signoff.note}` : ''}`,
      );
    } else {
      push(`- ${signer}: not signed`);
    }
  }
  push();
  push('---');
  push('Open items may remain, but they must never be presented as accepted without evidence.');
  return lines.join('\n');
}

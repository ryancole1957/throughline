import { buildMappingName } from '@throughline/shared';

import type {
  AcceptanceDecision,
  AcceptanceStatus,
  EvidenceType,
  Priority,
  ProjectRole,
  ReviewDecision,
  RiskSeverity,
  RiskStatus,
  StepStatus,
  SupplyStatus,
  SystemRole,
} from '@throughline/shared';

import { stepScopeSignature } from '../../src/data/steps';
import { hashPassword } from '../../src/lib/password';
import { nowIso } from '../../src/lib/time';
import type { AppDatabase } from '../../src/db';

interface SampleUser {
  key: string;
  name: string;
  email: string;
  title: string;
  systemRole: SystemRole;
}

interface SampleReview {
  stage: 'core' | 'business';
  decision: ReviewDecision;
  by: string;
  remarks: string;
}

interface SampleAcceptance {
  decision: AcceptanceDecision;
  by: string;
  remarks: string;
}

interface SampleItem {
  module: string;
  title: string;
  supply: SupplyStatus;
  acceptance: AcceptanceStatus;
  coreRequired: boolean;
  businessRequired: boolean;
  reviews: SampleReview[];
  acceptanceRecord?: SampleAcceptance;
}

const users: SampleUser[] = [
  {
    key: 'receiver',
    name: 'Alex Morgan',
    email: 'alex@example.com',
    title: 'Engineering Lead',
    systemRole: 'member',
  },
  {
    key: 'delivery',
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    title: 'Senior Engineer',
    systemRole: 'member',
  },
  {
    key: 'core',
    name: 'Priya Nair',
    email: 'priya@example.com',
    title: 'Staff Engineer',
    systemRole: 'member',
  },
  {
    key: 'business',
    name: 'Sofia Reyes',
    email: 'sofia@example.com',
    title: 'Product Operations',
    systemRole: 'member',
  },
  {
    key: 'admin',
    name: 'Admin',
    email: 'admin@example.com',
    title: 'System Administrator',
    systemRole: 'admin',
  },
];

const members: Array<{ key: string; role: ProjectRole }> = [
  { key: 'receiver', role: 'receiver' },
  { key: 'delivery', role: 'delivery' },
  { key: 'core', role: 'core_reviewer' },
  { key: 'business', role: 'business_reviewer' },
];

const passed = (acceptanceRecord: SampleAcceptance): SampleAcceptance => acceptanceRecord;

const corePass: SampleReview = {
  stage: 'core',
  decision: 'passed',
  by: 'core',
  remarks: 'Verified against the current revision.',
};
const businessConfirm: SampleReview = {
  stage: 'business',
  decision: 'confirmed',
  by: 'business',
  remarks: 'Confirmed with the receiving team.',
};

const items: SampleItem[] = [
  {
    module: 'Architecture',
    title: 'Service topology and runtime dependencies',
    supply: 'submitted',
    acceptance: 'passed',
    coreRequired: true,
    businessRequired: true,
    reviews: [corePass, businessConfirm],
    acceptanceRecord: passed({ decision: 'passed', by: 'receiver', remarks: 'Reproduced in staging.' }),
  },
  {
    module: 'Architecture',
    title: 'API contract for the reporting service',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: true,
    reviews: [corePass],
  },
  {
    module: 'Operations',
    title: 'Incident escalation and paging runbook',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Operations',
    title: 'Deployment rollback procedure',
    supply: 'pending_submission',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Data',
    title: 'Data retention and archival policy',
    supply: 'submitted',
    acceptance: 'conditional',
    coreRequired: true,
    businessRequired: true,
    reviews: [corePass, businessConfirm],
    acceptanceRecord: passed({
      decision: 'conditional',
      by: 'receiver',
      remarks: 'Archive restore drill must be completed.',
    }),
  },
  {
    module: 'Data',
    title: 'Schema migration playbook',
    supply: 'submitted',
    acceptance: 'passed',
    coreRequired: true,
    businessRequired: false,
    reviews: [corePass],
    acceptanceRecord: passed({ decision: 'passed', by: 'receiver', remarks: 'Migration replayed cleanly.' }),
  },
  {
    module: 'Security',
    title: 'Access review and privileged roles',
    supply: 'submitted',
    acceptance: 'conditional',
    coreRequired: true,
    businessRequired: true,
    reviews: [corePass, businessConfirm],
    acceptanceRecord: passed({
      decision: 'conditional',
      by: 'receiver',
      remarks: 'Quarterly access review to be scheduled.',
    }),
  },
  {
    module: 'Security',
    title: 'Credential rotation inventory',
    supply: 'pending_submission',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Delivery',
    title: 'CI pipeline and release gates',
    supply: 'submitted',
    acceptance: 'passed',
    coreRequired: true,
    businessRequired: false,
    reviews: [corePass],
    acceptanceRecord: passed({ decision: 'passed', by: 'receiver', remarks: 'Release gate reproduced.' }),
  },
  {
    module: 'Delivery',
    title: 'Test strategy and coverage report',
    supply: 'submitted',
    acceptance: 'passed',
    coreRequired: true,
    businessRequired: true,
    reviews: [corePass, businessConfirm],
    acceptanceRecord: passed({ decision: 'passed', by: 'receiver', remarks: 'Coverage report reviewed.' }),
  },
  {
    module: 'Delivery',
    title: 'Local development bootstrap guide',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Access',
    title: 'Role-based navigation and permissions',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Integration',
    title: 'Webhook retry and dead-letter handling',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: false,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Integration',
    title: 'Partner API sandbox notes',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Operations',
    title: 'Observability dashboards',
    supply: 'submitted',
    acceptance: 'passed',
    coreRequired: true,
    businessRequired: false,
    reviews: [corePass],
    acceptanceRecord: passed({ decision: 'passed', by: 'receiver', remarks: 'Dashboards validated.' }),
  },
  {
    module: 'Operations',
    title: 'On-call transition checklist',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Delivery',
    title: 'Release candidate verification record',
    supply: 'submitted',
    acceptance: 'conditional',
    coreRequired: true,
    businessRequired: true,
    reviews: [corePass, businessConfirm],
    acceptanceRecord: passed({
      decision: 'conditional',
      by: 'receiver',
      remarks: 'One flaky integration test to be stabilized.',
    }),
  },
  {
    module: 'Data',
    title: 'Analytics backfill plan',
    supply: 'pending_submission',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Security',
    title: 'Threat model review',
    supply: 'pending_submission',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Delivery',
    title: 'Service ownership catalogue',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: false,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Integration',
    title: 'Event schema compatibility',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Operations',
    title: 'Disaster recovery exercise',
    supply: 'pending_submission',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: false,
    reviews: [],
  },
  {
    module: 'Data',
    title: 'Warehouse access matrix',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: true,
    businessRequired: true,
    reviews: [],
  },
  {
    module: 'Architecture',
    title: 'Architecture decision log',
    supply: 'submitted',
    acceptance: 'pending_review',
    coreRequired: false,
    businessRequired: false,
    reviews: [],
  },
];

const risks: Array<{
  code: string;
  title: string;
  severity: RiskSeverity;
  status: RiskStatus;
  owner: string;
  dueOffset: number;
}> = [
  {
    code: 'R-01',
    title: 'Invoice rounding mismatch between services',
    severity: 'high',
    status: 'in_progress',
    owner: 'core',
    dueOffset: 3,
  },
  {
    code: 'R-02',
    title: 'Mobile reporting scope not delivered',
    severity: 'high',
    status: 'escalated',
    owner: 'business',
    dueOffset: 6,
  },
  {
    code: 'R-04',
    title: 'Production access not fully revoked',
    severity: 'high',
    status: 'open',
    owner: 'delivery',
    dueOffset: 9,
  },
];

const assets: Array<{
  code: string;
  name: string;
  type: string;
  sensitivity: 'internal' | 'sensitive' | 'confidential';
  reference: string;
  custodian: string;
  status: 'pending_verification' | 'verified' | 'pending_rotation';
}> = [
  {
    code: 'A-04',
    name: 'Production console',
    type: 'Console access',
    sensitivity: 'confidential',
    reference: 'console.example.internal',
    custodian: 'Platform team',
    status: 'pending_verification',
  },
  {
    code: 'A-07',
    name: 'API signing key',
    type: 'Secret',
    sensitivity: 'confidential',
    reference: 'vault://platform/signing-key',
    custodian: 'Security team',
    status: 'pending_rotation',
  },
];

const steps: Array<{
  position: number;
  name: string;
  status: StepStatus;
  items?: number[];
  pages?: number[];
}> = [
  { position: 1, name: 'Sign in and load the workspace', status: 'passed' },
  { position: 2, name: 'Create a project and confirm milestones', status: 'passed' },
  { position: 3, name: 'Submit evidence for an item', status: 'passed', items: [1, 2] },
  { position: 4, name: 'Record a technical review', status: 'passed', items: [17] },
  { position: 5, name: 'Record a business confirmation', status: 'pending', items: [4] },
  { position: 6, name: 'Record an acceptance decision', status: 'pending', items: [5] },
  { position: 7, name: 'Verify a delivery asset', status: 'pending' },
  {
    position: 8,
    name: 'Close the project after all sign-offs',
    status: 'pending',
    items: [2],
    pages: [0, 2],
  },
];

const chains = [
  {
    title: 'Reporting',
    page: '/reports',
    url: 'https://app.example.com/reports',
    endpoints: [
      { method: 'GET', path: '/api/reports', note: 'List saved reports' },
      { method: 'GET', path: '/api/reports/:id/snapshots', note: 'Load a snapshot range' },
      { method: 'POST', path: '/api/reports/export', note: 'Start an export job' },
    ],
    service: 'reporting-api',
    tables: 'reports, snapshots',
    environment: 'Staging',
    ownerName: 'Jordan Lee',
  },
  {
    title: 'Account settings',
    page: '/settings',
    url: 'https://app.example.com/settings',
    endpoints: [
      { method: 'GET', path: '/api/account', note: 'Load the profile' },
      { method: 'PATCH', path: '/api/account', note: 'Save profile changes' },
      { method: 'POST', path: '/api/account/credentials/rotate', note: 'Rotate an API key' },
    ],
    service: 'identity-api',
    tables: 'users, sessions',
    environment: 'Staging',
    ownerName: 'Priya Nair',
  },
  {
    title: 'Order list',
    page: '/orders',
    url: 'https://app.example.com/orders',
    endpoints: [
      { method: 'GET', path: '/api/orders', note: 'Page through orders' },
      { method: 'GET', path: '/api/orders/stats', note: 'Summary tiles above the table' },
    ],
    service: 'orders-api',
    tables: 'orders, order_items',
    environment: 'Staging',
    ownerName: 'Alex Morgan',
  },
];

const day = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const at = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString();

export interface SampleDatasetResult {
  projectId: string;
  teamId: string;
  users: Record<string, string>;
}

export async function seedSampleDataset(
  db: AppDatabase,
  options: { password: string },
): Promise<SampleDatasetResult> {
  const timestamp = nowIso();
  const passwordHashes: Record<string, string> = {};
  for (const user of users) passwordHashes[user.key] = await hashPassword(options.password);

  const userIds: Record<string, string> = {};
  for (const user of users) userIds[user.key] = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const itemIds = items.map(() => crypto.randomUUID());
  const itemId = (seq: number) => itemIds[seq - 1]!;

  const run = db.transaction(() => {
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, name, title, password_hash, system_role, status, created_at, updated_at, last_login_at)
      VALUES (@id, @email, @name, @title, @passwordHash, @systemRole, 'active', @createdAt, @createdAt, NULL)
    `);
    for (const user of users) {
      insertUser.run({
        id: userIds[user.key],
        email: user.email,
        name: user.name,
        title: user.title,
        passwordHash: passwordHashes[user.key],
        systemRole: user.systemRole,
        createdAt: at(720),
      });
    }

    db.prepare(`
      INSERT INTO teams (id, name, join_code, created_by, created_at, updated_at)
      VALUES (?, 'Atlas Team', 'ATLAS2026', ?, ?, ?)
    `).run(teamId, userIds.receiver, at(216), timestamp);

    const insertTeamMember = db.prepare(
      'INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    );
    insertTeamMember.run(teamId, userIds.receiver, 'owner', at(216));
    for (const key of ['delivery', 'core', 'business', 'admin']) {
      insertTeamMember.run(teamId, userIds[key], 'member', at(216));
    }

    db.prepare(`
      INSERT INTO projects (id, team_id, code, name, client, stage, status, scope, kickoff, deadline, created_by, closed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'verification', 'active', ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      projectId,
      teamId,
      'TL-2026-007',
      'Atlas Platform Delivery',
      'Northwind Labs',
      'Production cutover for the Atlas platform and decommissioning of the legacy worker service.',
      day(-8),
      day(10),
      userIds.receiver,
      at(216),
      timestamp,
    );

    const insertMember = db.prepare(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    );
    for (const member of members) {
      insertMember.run(projectId, userIds[member.key], member.role, at(216));
    }

    const insertMilestone = db.prepare(
      'INSERT INTO project_milestones (project_id, stage, planned_date, completed_at) VALUES (?, ?, ?, ?)',
    );
    insertMilestone.run(projectId, 'draft', day(-9), at(216));
    insertMilestone.run(projectId, 'scope', day(-8), at(192));
    insertMilestone.run(projectId, 'collection', day(-6), at(144));
    insertMilestone.run(projectId, 'walkthrough', day(-1), at(24));
    insertMilestone.run(projectId, 'verification', day(0), null);
    insertMilestone.run(projectId, 'signoff', day(8), null);
    insertMilestone.run(projectId, 'closed', day(10), null);

    const insertItem = db.prepare(`
      INSERT INTO items (
        id, project_id, seq, code, module, title, scope, priority, due_date,
        supply_status, acceptance_status, rule, revision, core_required, business_required,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `);
    const insertEvidence = db.prepare(`
      INSERT INTO evidence (id, item_id, author_id, type, environment, version, reference, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertReview = db.prepare(`
      INSERT INTO reviews (id, item_id, author_id, stage, decision, remarks, environment, version, reference, revision, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 1, ?)
    `);
    const insertAcceptance = db.prepare(`
      INSERT INTO acceptances (id, item_id, reviewer_id, decision, remarks, environment, version, reference, revision, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', 1, ?)
    `);

    for (const [index, item] of items.entries()) {
      const currentId = itemIds[index]!;
      const seq = index + 1;
      const priority: Priority = seq <= 8 ? 'high' : seq <= 18 ? 'medium' : 'low';
      const evidenceCount = item.supply === 'submitted' ? 1 : 0;
      insertItem.run(
        currentId,
        projectId,
        seq,
        `TL-${String(seq).padStart(3, '0')}`,
        item.module,
        item.title,
        `${item.title} delivery evidence and verification notes.`,
        priority,
        day(seq <= 12 ? 2 + (seq % 4) : 5 + (seq % 6)),
        item.supply,
        item.acceptance,
        'The receiver reproduces the documented behavior in an authorized environment.',
        item.coreRequired ? 1 : 0,
        item.businessRequired ? 1 : 0,
        userIds.receiver,
        at(192),
        item.acceptanceRecord ? at(48) : at(24),
      );

      const evidenceType: EvidenceType = seq % 3 === 0 ? 'test_record' : 'document';
      for (let evidenceIndex = 0; evidenceIndex < evidenceCount; evidenceIndex += 1) {
        insertEvidence.run(
          crypto.randomUUID(),
          currentId,
          userIds.delivery,
          evidenceType,
          'Staging',
          'v2.4.0',
          `evidence/${seq}-${evidenceIndex + 1}.md`,
          `Reference material for ${item.title.toLowerCase()}.`,
          at(72 - index),
        );
      }

      for (const review of item.reviews) {
        insertReview.run(
          crypto.randomUUID(),
          currentId,
          userIds[review.by],
          review.stage,
          review.decision,
          review.remarks,
          'Staging',
          'v2.4.0',
          at(48),
        );
      }

      if (item.acceptanceRecord) {
        insertAcceptance.run(
          crypto.randomUUID(),
          currentId,
          userIds[item.acceptanceRecord.by],
          item.acceptanceRecord.decision,
          item.acceptanceRecord.remarks,
          'Staging',
          'v2.4.0',
          at(36),
        );
      }
    }

    db.prepare(`
      INSERT INTO conditions (id, project_id, item_id, acceptance_id, code, description, owner_id, due_date, severity, status, created_at, closed_at, closed_by)
      VALUES (?, ?, ?, NULL, 'C-01', ?, ?, ?, 'high', 'open', ?, NULL, NULL)
    `).run(
      crypto.randomUUID(),
      projectId,
      itemId(5),
      'Complete an archive restore drill and attach the signed record.',
      userIds.business,
      day(7),
      at(36),
    );

    const insertRisk = db.prepare(`
      INSERT INTO risks (id, project_id, code, title, impact, mitigation, severity, status, owner_id, due_date, progress, exception_note, exception_by, created_by, created_at, updated_at, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, NULL)
    `);
    for (const risk of risks) {
      insertRisk.run(
        crypto.randomUUID(),
        projectId,
        risk.code,
        risk.title,
        'May delay cutover or leave an accountability gap.',
        'Track to closure before sign-off.',
        risk.severity,
        risk.status,
        userIds[risk.owner],
        day(risk.dueOffset),
        risk.status === 'open' ? '' : 'Mitigation underway.',
        userIds.receiver,
        at(96),
        at(24),
      );
    }

    const insertAsset = db.prepare(`
      INSERT INTO assets (id, project_id, code, name, type, sensitivity, reference, custodian, status, verified_at, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?)
    `);
    for (const asset of assets) {
      insertAsset.run(
        crypto.randomUUID(),
        projectId,
        asset.code,
        asset.name,
        asset.type,
        asset.sensitivity,
        asset.reference,
        asset.custodian,
        asset.status,
        at(72),
        at(24),
      );
    }

    const insertChain = db.prepare(`
      INSERT INTO chains (id, project_id, name, title, page, url, endpoints, service, tables, environment, owner_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const chainIds = chains.map(() => crypto.randomUUID());
    chains.forEach((chain, index) => {
      insertChain.run(
        chainIds[index]!,
        projectId,
        buildMappingName(chain.page, chain.endpoints),
        chain.title,
        chain.page,
        chain.url,
        JSON.stringify(chain.endpoints),
        chain.service,
        chain.tables,
        chain.environment,
        chain.ownerName,
        at(48),
        at(48),
      );
    });

    const insertStep = db.prepare(`
      INSERT INTO e2e_steps (id, project_id, position, name, status, note, environment, fingerprint, recorded_by, recorded_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
    `);
    const insertStepItem = db.prepare(
      'INSERT INTO e2e_step_items (step_id, item_id) VALUES (?, ?)',
    );
    const insertStepChain = db.prepare(
      'INSERT INTO e2e_step_chains (step_id, chain_id) VALUES (?, ?)',
    );
    for (const step of steps) {
      const recorded = step.status === 'passed';
      const stepId = crypto.randomUUID();
      insertStep.run(
        stepId,
        projectId,
        step.position,
        step.name,
        step.status,
        recorded ? 'Verified in staging.' : '',
        recorded ? 'Staging' : '',
        recorded ? userIds.receiver : null,
        recorded ? at(30) : null,
        at(48),
      );
      for (const seq of step.items ?? []) insertStepItem.run(stepId, itemId(seq));
      for (const page of step.pages ?? []) insertStepChain.run(stepId, chainIds[page]!);
      if (recorded) {
        db.prepare('UPDATE e2e_steps SET fingerprint = ? WHERE id = ?').run(
          stepScopeSignature(db, stepId),
          stepId,
        );
      }
    }

    const insertEvent = db.prepare(`
      INSERT INTO events (id, project_id, actor_id, item_id, action, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const eventRows = [
      [userIds.core, itemId(17), 'item.review.rechecked', 'Technical review repeated against the current revision.', at(1)],
      [userIds.receiver, itemId(5), 'item.acceptance.conditional', 'Accepted with condition C-01.', at(2)],
      [userIds.receiver, itemId(17), 'item.rule.revised', 'Acceptance standard revised; earlier reviews superseded.', at(3)],
      [userIds.receiver, itemId(2), 'note.question.created', 'Question opened about the reporting contract.', at(20)],
      [userIds.business, itemId(4), 'item.review.returned', 'Business confirmation returned for additional detail.', at(21)],
      [userIds.core, null, 'risk.created', 'Risk R-01 recorded during verification.', at(23)],
      [userIds.receiver, null, 'e2e.recorded', 'End-to-end steps 1–4 passed in staging.', at(29)],
    ] as const;
    for (const [actorId, linkedItemId, action, detail, createdAt] of eventRows) {
      insertEvent.run(crypto.randomUUID(), projectId, actorId, linkedItemId, action, detail, createdAt);
    }
  });

  run();
  return { projectId, teamId, users: userIds };
}

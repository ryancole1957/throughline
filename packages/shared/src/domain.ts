export const SYSTEM_ROLES = ['admin', 'member'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const TEAM_ROLES = ['owner', 'member'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const PROJECT_ROLES = [
  'receiver',
  'delivery',
  'core_reviewer',
  'business_reviewer',
  'observer',
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Roles that carry an explicit delivery accountability and must sign the report. */
export const SIGNOFF_ROLES = [
  'delivery',
  'core_reviewer',
  'business_reviewer',
  'receiver',
] as const;
export type SignoffRole = (typeof SIGNOFF_ROLES)[number];

export const PROJECT_STAGES = [
  'draft',
  'scope',
  'collection',
  'walkthrough',
  'verification',
  'signoff',
  'closed',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PROJECT_STATUSES = ['active', 'paused'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STAGE_ACTIONS = ['advance', 'pause', 'resume', 'reopen'] as const;
export type ProjectStageAction = (typeof PROJECT_STAGE_ACTIONS)[number];

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SUPPLY_STATUSES = ['pending_submission', 'submitted', 'needs_information'] as const;
export type SupplyStatus = (typeof SUPPLY_STATUSES)[number];

export const ACCEPTANCE_STATUSES = [
  'pending_review',
  'in_verification',
  'passed',
  'conditional',
  'rejected',
  'not_applicable',
] as const;
export type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];

/** Statuses that count as an acceptance decision in progress reporting. */
export const ACCEPTANCE_SETTLED: ReadonlySet<AcceptanceStatus> = new Set(['passed', 'conditional']);

export const REVIEW_STAGES = ['core', 'business'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

export const REVIEW_DECISIONS = ['passed', 'confirmed', 'returned', 'failed'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export type CoreReviewDecision = 'passed' | 'returned' | 'failed';
export type BusinessReviewDecision = 'confirmed' | 'returned';

export const ACCEPTANCE_DECISIONS = [
  'passed',
  'conditional',
  'rejected',
  'not_applicable',
] as const;
export type AcceptanceDecision = (typeof ACCEPTANCE_DECISIONS)[number];

export const EVIDENCE_TYPES = [
  'document',
  'interface',
  'test_record',
  'demo_recording',
  'configuration',
  'meeting_minutes',
  'other',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const RISK_SEVERITIES = ['high', 'medium', 'low'] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_STATUSES = ['open', 'in_progress', 'escalated', 'mitigated', 'closed'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const RISK_ACTIONS = ['start', 'mitigate', 'escalate', 'back', 'approve', 'close'] as const;
export type RiskAction = (typeof RISK_ACTIONS)[number];

export const CONDITION_SEVERITIES = ['high', 'medium', 'low'] as const;
export type ConditionSeverity = (typeof CONDITION_SEVERITIES)[number];

export const CONDITION_STATUSES = ['open', 'closed'] as const;
export type ConditionStatus = (typeof CONDITION_STATUSES)[number];

export const ASSET_SENSITIVITIES = ['internal', 'sensitive', 'confidential'] as const;
export type AssetSensitivity = (typeof ASSET_SENSITIVITIES)[number];

export const ASSET_STATUSES = ['pending_verification', 'verified', 'pending_rotation'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const STEP_STATUSES = ['pending', 'in_progress', 'passed', 'failed'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const CONCLUSION_DECISIONS = ['accepted', 'conditionally_accepted', 'not_accepted'] as const;
export type ConclusionDecision = (typeof CONCLUSION_DECISIONS)[number];

export const SIGNOFF_DECISIONS = ['agree', 'agree_with_reservations', 'disagree'] as const;
export type SignoffDecision = (typeof SIGNOFF_DECISIONS)[number];

export const NOTE_KINDS = ['note', 'question', 'answer'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const PROJECT_STAGE_SEQUENCE: readonly ProjectStage[] = [
  'draft',
  'scope',
  'collection',
  'walkthrough',
  'verification',
  'signoff',
];

export function nextProjectStage(stage: ProjectStage): ProjectStage | null {
  const index = PROJECT_STAGE_SEQUENCE.indexOf(stage);
  if (index < 0 || index >= PROJECT_STAGE_SEQUENCE.length - 1) return null;
  return PROJECT_STAGE_SEQUENCE[index + 1] ?? null;
}

export const CORE_DECISIONS_BY_STAGE: Record<ReviewStage, readonly ReviewDecision[]> = {
  core: ['passed', 'returned', 'failed'],
  business: ['confirmed', 'returned'],
};

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Short label that names a mapping by its page and the first endpoint it calls. */
export function buildMappingName(
  page: string,
  endpoints: readonly { method: string; path: string }[],
): string {
  const first = endpoints[0];
  const label = first ? `${first.method ? `${first.method} ` : ''}${first.path}` : '';
  const extra = endpoints.length > 1 ? ` +${endpoints.length - 1}` : '';
  return `${page}${label ? ` → ${label}` : ''}${extra}`.slice(0, 120);
}

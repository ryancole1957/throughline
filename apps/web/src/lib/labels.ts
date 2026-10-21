import type {
  AcceptanceStatus,
  AssetSensitivity,
  AssetStatus,
  ConditionSeverity,
  ConditionStatus,
  ConclusionDecision,
  EvidenceType,
  Priority,
  ProjectRole,
  ProjectStage,
  ProjectStatus,
  ReviewDecision,
  ReviewStage,
  RiskAction,
  RiskSeverity,
  RiskStatus,
  SignoffDecision,
  StepStatus,
  SupplyStatus,
  TodoKind,
} from '@throughline/shared';

export const PROJECT_STAGE_ORDER: ProjectStage[] = [
  'draft',
  'scope',
  'collection',
  'walkthrough',
  'verification',
  'signoff',
  'closed',
];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  draft: 'Draft',
  scope: 'Scope',
  collection: 'Collection',
  walkthrough: 'Walkthrough',
  verification: 'Verification',
  signoff: 'Sign-off',
  closed: 'Closed',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
};

export const ROLE_LABELS: Record<ProjectRole, string> = {
  receiver: 'Acceptance owner',
  delivery: 'Delivery',
  core_reviewer: 'Technical reviewer',
  business_reviewer: 'Business reviewer',
  observer: 'Observer',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const SUPPLY_LABELS: Record<SupplyStatus, string> = {
  pending_submission: 'Awaiting submission',
  submitted: 'Submitted',
  needs_information: 'Needs information',
};

export const ACCEPTANCE_LABELS: Record<AcceptanceStatus, string> = {
  pending_review: 'Pending review',
  in_verification: 'In verification',
  passed: 'Accepted',
  conditional: 'Conditional',
  rejected: 'Rejected',
  not_applicable: 'Not applicable',
};

export const REVIEW_STAGE_LABELS: Record<ReviewStage, string> = {
  core: 'Technical review',
  business: 'Business review',
};

export function reviewDecisionLabel(stage: ReviewStage, decision: ReviewDecision): string {
  if (decision === 'returned') return 'Returned';
  if (decision === 'passed') return 'Passed';
  if (decision === 'confirmed') return 'Confirmed';
  if (decision === 'failed') return 'Failed';
  return stage === 'core' ? 'Pending review' : 'Pending confirmation';
}

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  document: 'Document',
  interface: 'API contract',
  test_record: 'Test record',
  demo_recording: 'Demo recording',
  configuration: 'Configuration sample',
  meeting_minutes: 'Meeting notes',
  other: 'Other',
};

export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  escalated: 'Escalated',
  mitigated: 'Mitigated',
  closed: 'Closed',
};

export const RISK_ACTION_LABELS: Record<RiskAction, string> = {
  start: 'Start mitigation',
  mitigate: 'Mark mitigated',
  escalate: 'Escalate to acceptance owner',
  back: 'Return to owner',
  approve: 'Approve exception and close',
  close: 'Confirm closure',
};

export const CONDITION_SEVERITY_LABELS: Record<ConditionSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const CONDITION_STATUS_LABELS: Record<ConditionStatus, string> = {
  open: 'Open',
  closed: 'Closed',
};

export const ASSET_SENSITIVITY_LABELS: Record<AssetSensitivity, string> = {
  internal: 'Internal',
  sensitive: 'Sensitive',
  confidential: 'Confidential',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  pending_verification: 'Pending verification',
  verified: 'Verified',
  pending_rotation: 'Pending rotation',
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  passed: 'Passed',
  failed: 'Failed',
};

export const CONCLUSION_LABELS: Record<ConclusionDecision, string> = {
  accepted: 'Accepted',
  conditionally_accepted: 'Conditionally accepted',
  not_accepted: 'Not accepted',
};

export const SIGNOFF_DECISION_LABELS: Record<SignoffDecision, string> = {
  agree: 'Agree',
  agree_with_reservations: 'Agree with reservations',
  disagree: 'Disagree',
};

export const TODO_KIND_LABELS: Record<TodoKind, string> = {
  submit_evidence: 'Submit evidence',
  supplement: 'Needs information',
  core_review: 'Technical review',
  business_review: 'Business review',
  acceptance: 'Acceptance',
  answer_question: 'Answer question',
  condition: 'Condition',
  risk_owner: 'Risk mitigation',
  risk_decision: 'Risk decision',
  asset_verification: 'Asset verification',
  asset_rotation: 'Credential rotation',
  signoff: 'Sign-off',
  conclusion: 'Conclusion',
};

export type TagTone = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'slate' | 'dim' | 'outline-red';

export function supplyTone(status: SupplyStatus): TagTone {
  return status === 'submitted' ? 'blue' : status === 'needs_information' ? 'amber' : 'gray';
}

export function acceptanceTone(status: AcceptanceStatus): TagTone {
  switch (status) {
    case 'passed':
      return 'green';
    case 'conditional':
      return 'amber';
    case 'rejected':
      return 'red';
    case 'in_verification':
      return 'blue';
    case 'not_applicable':
      return 'dim';
    default:
      return 'slate';
  }
}

export function priorityTone(priority: Priority): TagTone {
  return priority === 'high' ? 'outline-red' : priority === 'medium' ? 'gray' : 'dim';
}

export function reviewDecisionTone(decision: ReviewDecision): TagTone {
  if (decision === 'passed' || decision === 'confirmed') return 'green';
  if (decision === 'returned') return 'amber';
  return 'red';
}

export function riskSeverityTone(severity: RiskSeverity): TagTone {
  return severity === 'high' ? 'red' : severity === 'medium' ? 'amber' : 'gray';
}

export function riskStatusTone(status: RiskStatus): TagTone {
  switch (status) {
    case 'open':
      return 'slate';
    case 'in_progress':
      return 'blue';
    case 'escalated':
      return 'red';
    case 'mitigated':
      return 'green';
    default:
      return 'gray';
  }
}

export function assetStatusTone(status: AssetStatus): TagTone {
  return status === 'verified' ? 'green' : status === 'pending_rotation' ? 'red' : 'amber';
}

export function sensitivityTone(sensitivity: AssetSensitivity): TagTone {
  return sensitivity === 'confidential' ? 'red' : sensitivity === 'sensitive' ? 'amber' : 'slate';
}

export function stepStatusTone(status: StepStatus): TagTone {
  return status === 'passed'
    ? 'green'
    : status === 'failed'
      ? 'red'
      : status === 'in_progress'
        ? 'blue'
        : 'gray';
}

export function conditionSeverityTone(severity: ConditionSeverity): TagTone {
  return severity === 'high' ? 'red' : severity === 'medium' ? 'amber' : 'gray';
}

export function conditionStatusTone(status: ConditionStatus): TagTone {
  return status === 'open' ? 'amber' : 'gray';
}

export function conclusionTone(decision: ConclusionDecision): TagTone {
  return decision === 'accepted'
    ? 'green'
    : decision === 'conditionally_accepted'
      ? 'amber'
      : 'red';
}

export function signoffDecisionTone(decision: SignoffDecision): TagTone {
  return decision === 'agree'
    ? 'green'
    : decision === 'agree_with_reservations'
      ? 'amber'
      : 'red';
}

export function stageTone(stage: ProjectStage): TagTone {
  if (stage === 'closed') return 'green';
  if (stage === 'signoff') return 'amber';
  return 'blue';
}

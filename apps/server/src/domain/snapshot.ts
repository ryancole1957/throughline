import { createHash } from 'node:crypto';

import type {
  AcceptanceStatus,
  ConditionSeverity,
  ConditionStatus,
  RiskSeverity,
  RiskStatus,
  StepStatus,
  SupplyStatus,
} from '@throughline/shared';

export interface SnapshotPayload {
  project: {
    code: string;
    deadline: string;
    scope: string;
  };
  conclusion: string | null;
  items: Array<{
    code: string;
    revision: number;
    supplyStatus: SupplyStatus;
    acceptanceStatus: AcceptanceStatus;
    evidenceCount: number;
    coreDecision: string | null;
    businessDecision: string | null;
  }>;
  conditions: Array<{
    code: string;
    status: ConditionStatus;
    severity: ConditionSeverity;
    dueDate: string;
  }>;
  risks: Array<{
    code: string;
    status: RiskStatus;
    severity: RiskSeverity;
    dueDate: string;
  }>;
  steps: Array<{ position: number; status: StepStatus }>;
}

/**
 * Stable fingerprint of the contractual scope shown in the report. Signing a
 * report pins this value so later edits are visibly detectable.
 */
export function computeSnapshotHash(payload: SnapshotPayload): string {
  const canonical = {
    project: payload.project,
    conclusion: payload.conclusion,
    items: [...payload.items].sort((a, b) => a.code.localeCompare(b.code)),
    conditions: [...payload.conditions].sort((a, b) => a.code.localeCompare(b.code)),
    risks: [...payload.risks].sort((a, b) => a.code.localeCompare(b.code)),
    steps: [...payload.steps].sort((a, b) => a.position - b.position),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

import type {
  AcceptanceDecision,
  AcceptanceStatus,
  BusinessReviewDecision,
  CoreReviewDecision,
  GateResult,
  ReviewDecision,
  ReviewStage,
  SupplyStatus,
} from '@throughline/shared';
import { CORE_DECISIONS_BY_STAGE } from '@throughline/shared';

export interface ReviewSignal {
  stage: ReviewStage;
  decision: ReviewDecision;
  revision: number;
  createdAt: string;
}

export interface GateInput {
  revision: number;
  supplyStatus: SupplyStatus;
  acceptanceStatus: AcceptanceStatus;
  evidenceCount: number;
  coreRequired: boolean;
  businessRequired: boolean;
  reviews: ReviewSignal[];
}

export function latestReviewFor(
  reviews: ReviewSignal[],
  stage: ReviewStage,
  revision: number,
): ReviewSignal | null {
  let latest: ReviewSignal | null = null;
  for (const review of reviews) {
    if (review.stage !== stage || review.revision !== revision) continue;
    if (!latest || review.createdAt >= latest.createdAt) latest = review;
  }
  return latest;
}

export function evaluateGate(input: GateInput): GateResult {
  const missing: string[] = [];
  if (input.supplyStatus === 'pending_submission') missing.push('Evidence has not been submitted');
  if (input.supplyStatus === 'needs_information') missing.push('Evidence needs updates');
  if (input.evidenceCount === 0) missing.push('No evidence has been submitted');

  const core = latestReviewFor(input.reviews, 'core', input.revision);
  if (input.coreRequired && core?.decision !== 'passed') {
    missing.push(
      core?.decision === 'returned'
        ? 'Technical review returned the item for updates'
        : core?.decision === 'failed'
          ? 'Technical review failed'
          : 'No valid technical review on record',
    );
  }

  const business = latestReviewFor(input.reviews, 'business', input.revision);
  if (input.businessRequired && business?.decision !== 'confirmed') {
    missing.push(
      business?.decision === 'returned'
        ? 'Business review returned the item for updates'
        : 'No business review on record',
    );
  }

  return { ready: missing.length === 0, missing };
}

export function allowedDecisionsForStage(stage: ReviewStage): readonly ReviewDecision[] {
  return CORE_DECISIONS_BY_STAGE[stage];
}

export interface ReviewEffect {
  supplyStatus: SupplyStatus;
  acceptanceStatus: AcceptanceStatus;
}

export function reviewEffect(
  stage: ReviewStage,
  decision: ReviewDecision,
  current: { supplyStatus: SupplyStatus; acceptanceStatus: AcceptanceStatus },
): ReviewEffect {
  const positive =
    (stage === 'core' && (decision as CoreReviewDecision) === 'passed') ||
    (stage === 'business' && (decision as BusinessReviewDecision) === 'confirmed');

  if (!positive) {
    return { supplyStatus: 'needs_information', acceptanceStatus: 'pending_review' };
  }

  const acceptanceStatus: AcceptanceStatus =
    current.acceptanceStatus === 'pending_review' || current.acceptanceStatus === 'rejected'
      ? 'in_verification'
      : current.acceptanceStatus;

  return { supplyStatus: current.supplyStatus, acceptanceStatus };
}

export function supplyStatusAfterAcceptance(
  decision: AcceptanceDecision,
  current: SupplyStatus,
): SupplyStatus {
  return decision === 'rejected' ? 'needs_information' : current;
}

export function acceptanceStatusFor(decision: AcceptanceDecision): AcceptanceStatus {
  switch (decision) {
    case 'passed':
      return 'passed';
    case 'conditional':
      return 'conditional';
    case 'rejected':
      return 'rejected';
    case 'not_applicable':
      return 'not_applicable';
  }
}

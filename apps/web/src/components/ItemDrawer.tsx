import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import type {
  AcceptanceDecision,
  Condition,
  ConditionSeverity,
  EvidenceType,
  ItemDetail,
  Note,
  ProjectDetail,
  ReviewDecision,
  ReviewStage,
} from '@throughline/shared';
import { EVIDENCE_TYPES } from '@throughline/shared';

import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  addDaysInput,
  cn,
  dueLabel,
  formatDate,
  formatDateTime,
} from '../lib/format';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import {
  ACCEPTANCE_LABELS,
  CONDITION_SEVERITY_LABELS,
  EVIDENCE_TYPE_LABELS,
  PRIORITY_LABELS,
  REVIEW_STAGE_LABELS,
  ROLE_LABELS,
  SUPPLY_LABELS,
  acceptanceTone,
  conditionSeverityTone,
  conditionStatusTone,
  priorityTone,
  reviewDecisionLabel,
  reviewDecisionTone,
  supplyTone,
} from '../lib/labels';
import { useToast } from '../lib/toast';
import { Dialog } from './Dialog';
import { GateChain, type GateState } from './Stepper';
import {
  Avatar,
  Button,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  StatusTag,
  Textarea,
} from './ui';

export type DrawerTab = 'review' | 'evidence' | 'notes' | 'log';

interface ItemDrawerProps {
  project: ProjectDetail;
  itemId: string | null;
  initialTab: DrawerTab;
  onClose: () => void;
}

const CLOSED_ACCEPTANCE = ['passed', 'conditional', 'not_applicable'];

export function ItemDrawer({ project, itemId, initialTab, onClose }: ItemDrawerProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);

  const [evidenceType, setEvidenceType] = useState<EvidenceType>('document');
  const [evidenceEnv, setEvidenceEnv] = useState('');
  const [evidenceVersion, setEvidenceVersion] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');

  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewEnv, setReviewEnv] = useState('');
  const [reviewVersion, setReviewVersion] = useState('');
  const [reviewReference, setReviewReference] = useState('');

  const [acceptEnv, setAcceptEnv] = useState('');
  const [acceptVersion, setAcceptVersion] = useState('');
  const [acceptReference, setAcceptReference] = useState('');
  const [acceptRemarks, setAcceptRemarks] = useState('');
  const [conditionOpen, setConditionOpen] = useState(false);
  const [conditionDescription, setConditionDescription] = useState('');
  const [conditionOwner, setConditionOwner] = useState('');
  const [conditionDue, setConditionDue] = useState(addDaysInput(7));
  const [conditionSeverity, setConditionSeverity] = useState<ConditionSeverity>('high');

  const [editingRule, setEditingRule] = useState(false);
  const [ruleDraft, setRuleDraft] = useState('');

  const [noteBody, setNoteBody] = useState('');
  const [noteIsQuestion, setNoteIsQuestion] = useState(false);
  const [noteAssignee, setNoteAssignee] = useState('');

  const [answerTarget, setAnswerTarget] = useState<Note | null>(null);
  const [answerBody, setAnswerBody] = useState('');
  const [closingCondition, setClosingCondition] = useState<Condition | null>(null);

  const detailQuery = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => api.items.get(itemId ?? ''),
    enabled: Boolean(itemId),
  });

  const detail = detailQuery.data;
  const item = detail?.item;
  const gate = detail?.gate ?? { ready: false, missing: [] };

  const members = project.members;
  const memberByRole = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const member of members) map.set(member.role, member);
    return map;
  }, [members]);
  const delivery = memberByRole.get('delivery');
  const coreReviewer = memberByRole.get('core_reviewer');
  const businessReviewer = memberByRole.get('business_reviewer');
  const receiver = memberByRole.get('receiver');

  const canComment =
    Boolean(project.myRole) && project.status === 'active' && project.stage !== 'closed';
  const canSubmitEvidence = Boolean(detail?.permissions.submitEvidence);
  const canAccept = Boolean(detail?.permissions.accept);
  const canEditRule = Boolean(detail?.permissions.editRule);
  const reviewStage: ReviewStage | null = detail?.permissions.reviewCore
    ? 'core'
    : detail?.permissions.reviewBusiness
      ? 'business'
      : null;
  const canReview =
    Boolean(reviewStage) &&
    !!item &&
    (reviewStage === 'core' ? item.coreRequired : item.businessRequired) &&
    item.supplyStatus === 'submitted' &&
    item.evidenceCount > 0 &&
    !CLOSED_ACCEPTANCE.includes(item.acceptanceStatus);

  const isAccepted = item ? ['passed', 'conditional'].includes(item.acceptanceStatus) : false;

  function applyDetail(updated: ItemDetail) {
    queryClient.setQueryData(['item', itemId], updated);
    void queryClient.invalidateQueries({ queryKey: ['items', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['report', project.id] });
  }

  async function run<T>(
    key: string,
    action: () => Promise<T>,
    options: { success?: string; apply?: (result: T) => void } = {},
  ): Promise<T | null> {
    setBusy(key);
    try {
      const result = await action();
      options.apply?.(result);
      if (options.success) toast.success(options.success);
      return result;
    } catch (error) {
      toast.error(describeError(error));
      return null;
    } finally {
      setBusy(null);
    }
  }

  function gateStates(): Array<{ label: string; person: string; state: GateState }> {
    if (!item) return [];
    const deliveryState: GateState =
      item.supplyStatus === 'submitted'
        ? 'done'
        : item.supplyStatus === 'needs_information'
          ? 'failed'
          : 'idle';
    const core = item.latestCore;
    const business = item.latestBusiness;
    const requiredStages: Array<{ stage: ReviewStage; latest: typeof core }> = [];
    if (item.coreRequired) requiredStages.push({ stage: 'core', latest: core });
    if (item.businessRequired) requiredStages.push({ stage: 'business', latest: business });
    const reviewNames = requiredStages
      .map(({ stage }) =>
        stage === 'core'
          ? coreReviewer?.name ?? t('Unassigned')
          : businessReviewer?.name ?? t('Unassigned'),
      )
      .join(' · ');
    const reviewDone =
      requiredStages.length > 0 &&
      requiredStages.every(({ stage, latest }) =>
        stage === 'core' ? latest?.decision === 'passed' : latest?.decision === 'confirmed',
      );
    const reviewFailed = requiredStages.some(({ latest }) =>
      ['returned', 'failed'].includes(latest?.decision ?? ''),
    );
    const reviewState: GateState = reviewDone
      ? 'done'
      : reviewFailed
        ? 'failed'
        : item.supplyStatus === 'submitted'
          ? 'active'
          : 'idle';
    const acceptanceState: GateState =
      item.acceptanceStatus === 'passed' || item.acceptanceStatus === 'conditional'
        ? 'done'
        : item.acceptanceStatus === 'rejected'
          ? 'failed'
          : gate.ready
            ? 'active'
            : 'idle';
    const steps: Array<{ label: string; person: string; state: GateState }> = [
      { label: t('Submit'), person: delivery?.name ?? t('Unassigned'), state: deliveryState },
    ];
    if (requiredStages.length) {
      steps.push({ label: t('Review'), person: reviewNames, state: reviewState });
    }
    steps.push({
      label: t('Acceptance'),
      person: receiver?.name ?? t('Unassigned'),
      state: acceptanceState,
    });
    return steps;
  }

  async function submitEvidence() {
    if (!item) return;
    if (!evidenceDescription.trim()) {
      toast.warning(t('Add an evidence description'));
      return;
    }
    const result = await run(
      'evidence',
      () =>
        api.items.addEvidence(item.id, {
          type: evidenceType,
          environment: evidenceEnv.trim(),
          version: evidenceVersion.trim(),
          reference: evidenceReference.trim(),
          description: evidenceDescription.trim(),
        }),
      { success: t('Evidence submitted'), apply: applyDetail },
    );
    if (result) {
      setEvidenceDescription('');
      setEvidenceReference('');
    }
  }

  async function submitReview(decision: ReviewDecision) {
    if (!item || !reviewStage) return;
    if (['returned', 'failed'].includes(decision) && !reviewRemarks.trim()) {
      toast.warning(t('Add a reason when returning or failing'));
      return;
    }
    await run(
      'review',
      () =>
        api.items.review(item.id, {
          stage: reviewStage,
          decision,
          remarks: reviewRemarks.trim(),
          environment: reviewEnv.trim(),
          version: reviewVersion.trim(),
          reference: reviewReference.trim(),
        }),
      {
        success: t('Review recorded: {{decision}}', {
          decision: t(reviewDecisionLabel(reviewStage, decision)),
        }),
        apply: (updated) => {
          applyDetail(updated);
          setReviewRemarks('');
        },
      },
    );
  }

  async function submitAcceptance(decision: AcceptanceDecision, condition?: {
    description: string;
    ownerId: string;
    dueDate: string;
    severity: ConditionSeverity;
  }) {
    if (!item) return;
    if (decision !== 'not_applicable' && (!acceptEnv.trim() || !acceptVersion.trim())) {
      toast.warning(t('Enter the environment and version'));
      return;
    }
    if (['rejected', 'not_applicable'].includes(decision) && !acceptRemarks.trim()) {
      toast.warning(
        decision === 'rejected'
          ? t('Add a reason when rejecting')
          : t('Add a note when marking as not applicable'),
      );
      return;
    }
    const result = await run(
      'acceptance',
      () =>
        api.items.accept(item.id, {
          decision,
          remarks: acceptRemarks.trim(),
          environment: decision === 'not_applicable' ? '' : acceptEnv.trim(),
          version: decision === 'not_applicable' ? '' : acceptVersion.trim(),
          reference: decision === 'not_applicable' ? '' : acceptReference.trim(),
          condition,
        }),
      {
        success: t(
          decision === 'passed'
            ? 'Acceptance recorded'
            : decision === 'conditional'
              ? 'Conditional acceptance recorded; condition created'
              : decision === 'rejected'
                ? 'Rejection recorded'
                : 'Marked as not applicable',
        ),
        apply: (updated) => {
          applyDetail(updated);
          setConditionOpen(false);
          setConditionDescription('');
          setAcceptRemarks('');
        },
      },
    );
    return result;
  }

  async function saveRule() {
    if (!item) return;
    if (!ruleDraft.trim() || ruleDraft.trim().length < 5) {
      toast.warning(t('Acceptance criteria are too short'));
      return;
    }
    if (ruleDraft.trim() === item.rule) {
      setEditingRule(false);
      return;
    }
    await run('rule', () => api.items.reviseRule(item.id, { rule: ruleDraft.trim() }), {
      success: t('Acceptance criteria updated; prior reviews are invalid'),
      apply: (updated) => {
        applyDetail(updated);
        setEditingRule(false);
      },
    });
  }

  async function addNote() {
    if (!item) return;
    if (!noteBody.trim()) {
      toast.warning(t('Enter a message'));
      return;
    }
    if (noteIsQuestion && !noteAssignee) {
      toast.warning(t('Select an assignee'));
      return;
    }
    await run(
      'note',
      () =>
        api.items.addNote(item.id, {
          body: noteBody.trim(),
          isQuestion: noteIsQuestion,
          assigneeId: noteIsQuestion ? noteAssignee : undefined,
        }),
      {
        success: noteIsQuestion ? t('Question added') : t('Comment posted'),
        apply: (updated) => {
          applyDetail(updated);
          setNoteBody('');
          setNoteIsQuestion(false);
          setNoteAssignee('');
        },
      },
    );
  }

  async function submitAnswer() {
    if (!answerTarget) return;
    if (!answerBody.trim()) {
      toast.warning(t('Enter a reply'));
      return;
    }
    await run(
      'answer',
      () => api.items.answerNote(answerTarget.id, { body: answerBody.trim() }),
      {
        success: t('Reply posted; question closed'),
        apply: (updated) => {
          applyDetail(updated);
          setAnswerTarget(null);
          setAnswerBody('');
        },
      },
    );
  }

  async function closeCondition() {
    if (!closingCondition) return;
    const result = await run(
      'condition',
      () => api.items.closeCondition(closingCondition.id),
      { success: t('Condition closed') },
    );
    if (result) {
      setClosingCondition(null);
      await queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
      void queryClient.invalidateQueries({ queryKey: ['report', project.id] });
    }
  }

  if (!itemId) return null;

  const tabs: Array<{ key: DrawerTab; label: string; count: number }> = detail
    ? [
        {
          key: 'review',
          label: t('Review & acceptance'),
          count: detail.reviews.length + detail.acceptances.length,
        },
        { key: 'evidence', label: t('Evidence'), count: detail.evidence.length },
        { key: 'notes', label: t('Discussion'), count: detail.notes.length },
        { key: 'log', label: t('History'), count: detail.events.length },
      ]
    : [];

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        placement="right"
        size="lg"
        title={
          detail ? (
            <span className="item-drawer-title">{detail.item.title}</span>
          ) : (
            t('Item details')
          )
        }
        description={
          detail ? (
            <div className="item-drawer-header-meta">
              <span className="mono">{detail.item.code}</span>
              <span>{detail.item.module}</span>
              <StatusTag tone={priorityTone(detail.item.priority)}>
                {t(PRIORITY_LABELS[detail.item.priority])}
              </StatusTag>
              <StatusTag tone="slate">
                {t('v{{revision}}', { revision: detail.item.revision })}
              </StatusTag>
              <StatusTag tone={supplyTone(detail.item.supplyStatus)}>
                {t(SUPPLY_LABELS[detail.item.supplyStatus])}
              </StatusTag>
              <StatusTag tone={acceptanceTone(detail.item.acceptanceStatus)}>
                {t(ACCEPTANCE_LABELS[detail.item.acceptanceStatus])}
              </StatusTag>
            </div>
          ) : null
        }
        bodyClassName="item-drawer-body"
      >
        {detailQuery.isPending ? (
          <LoadingState label={t('Loading item details…')} />
        ) : detailQuery.isError || !detail ? (
          <div className="drawer-pane">
            <ErrorState
              message={describeError(detailQuery.error)}
              onRetry={() => void detailQuery.refetch()}
            />
          </div>
        ) : (
          <>
            <div className="item-drawer-top">
              <GateChain steps={gateStates()} />
              <div className="item-drawer-context">
                <span className="item-drawer-context-item">
                  <Icon name="calendar" size={12} />
                  {t('Due {{date}} · {{status}}', {
                    date: formatDate(detail.item.dueDate),
                    status: CLOSED_ACCEPTANCE.includes(detail.item.acceptanceStatus)
                      ? t('Done')
                      : dueLabel(detail.item.dueDate),
                  })}
                </span>
                {detail.item.riskCodes.map((code) => (
                  <span className="chip" key={code}>
                    <Icon name="alert" size={10} />
                    {code}
                  </span>
                ))}
                {detail.assets.map((asset) => (
                  <span className="chip" key={asset.id}>
                    <Icon name="box" size={10} />
                    {asset.code} {asset.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="item-drawer-tabs" role="tablist" aria-label={t('Item details tabs')}>
              {tabs.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.key}
                  className={cn('drawer-tab', tab === entry.key && 'is-active')}
                  onClick={() => setTab(entry.key)}
                >
                  {entry.label}
                  {entry.count ? <span className="drawer-tab-count">{entry.count}</span> : null}
                </button>
              ))}
            </div>
            <div className="item-drawer-scroll">
              <div className="drawer-pane" role="tabpanel">
                {tab === 'review' ? (
                  <ReviewPane
                    detail={detail}
                    project={project}
                    memberByRole={memberByRole}
                    gate={gate}
                    canEditRule={canEditRule}
                    editingRule={editingRule}
                    ruleDraft={ruleDraft}
                    setRuleDraft={setRuleDraft}
                    setEditingRule={setEditingRule}
                    saveRule={saveRule}
                    busy={busy}
                    canReview={canReview}
                    reviewStage={reviewStage}
                    reviewRemarks={reviewRemarks}
                    setReviewRemarks={setReviewRemarks}
                    reviewEnv={reviewEnv}
                    setReviewEnv={setReviewEnv}
                    reviewVersion={reviewVersion}
                    setReviewVersion={setReviewVersion}
                    reviewReference={reviewReference}
                    setReviewReference={setReviewReference}
                    submitReview={submitReview}
                    canAccept={canAccept}
                    acceptEnv={acceptEnv}
                    setAcceptEnv={setAcceptEnv}
                    acceptVersion={acceptVersion}
                    setAcceptVersion={setAcceptVersion}
                    acceptReference={acceptReference}
                    setAcceptReference={setAcceptReference}
                    acceptRemarks={acceptRemarks}
                    setAcceptRemarks={setAcceptRemarks}
                    onAccept={submitAcceptance}
                    onConditional={() => {
                      if (acceptEnv.trim() && acceptVersion.trim()) setConditionOpen(true);
                      else toast.warning(t('Enter the environment and version first'));
                    }}
                    isAccepted={isAccepted}
                    currentUserId={user?.id ?? ''}
                    onCloseCondition={(condition) => setClosingCondition(condition)}
                  />
                ) : null}
                {tab === 'evidence' ? (
                  <EvidencePane
                    detail={detail}
                    canSubmit={canSubmitEvidence}
                    evidenceType={evidenceType}
                    setEvidenceType={setEvidenceType}
                    evidenceEnv={evidenceEnv}
                    setEvidenceEnv={setEvidenceEnv}
                    evidenceVersion={evidenceVersion}
                    setEvidenceVersion={setEvidenceVersion}
                    evidenceReference={evidenceReference}
                    setEvidenceReference={setEvidenceReference}
                    evidenceDescription={evidenceDescription}
                    setEvidenceDescription={setEvidenceDescription}
                    submit={submitEvidence}
                    busy={busy}
                  />
                ) : null}
                {tab === 'notes' ? (
                  <NotesPane
                    detail={detail}
                    project={project}
                    canComment={canComment}
                    noteBody={noteBody}
                    setNoteBody={setNoteBody}
                    noteIsQuestion={noteIsQuestion}
                    setNoteIsQuestion={setNoteIsQuestion}
                    noteAssignee={noteAssignee}
                    setNoteAssignee={setNoteAssignee}
                    submit={addNote}
                    busy={busy}
                    currentUserId={user?.id ?? ''}
                    onAnswer={(note) => {
                      setAnswerTarget(note);
                      setAnswerBody('');
                    }}
                  />
                ) : null}
                {tab === 'log' ? <LogPane detail={detail} /> : null}
              </div>
            </div>
          </>
        )}
      </Dialog>

      <Dialog
        open={Boolean(answerTarget)}
        onClose={() => setAnswerTarget(null)}
        title={t('Answer question')}
        description={
          answerTarget
            ? t('Question from {{name}}', { name: answerTarget.author.name })
            : undefined
        }
        size="md"
        footer={
          <>
            <Button onClick={() => setAnswerTarget(null)}>{t('Cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => void submitAnswer()}
              loading={busy === 'answer'}
            >
              {t('Submit answer')}
            </Button>
          </>
        }
      >
        {answerTarget ? <p className="md-quote">{answerTarget.body}</p> : null}
        <Field label={t('Reply')} htmlFor="answer-body" required>
          <Textarea
            id="answer-body"
            data-autofocus
            value={answerBody}
            onChange={(event) => setAnswerBody(event.target.value)}
            placeholder={t('Add the facts or resolution.')}
          />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(closingCondition)}
        onClose={() => setClosingCondition(null)}
        title={t('Close condition')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setClosingCondition(null)}>{t('Cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => void closeCondition()}
              loading={busy === 'condition'}
            >
              {t('Close condition')}
            </Button>
          </>
        }
      >
        {closingCondition ? (
          <div className="condition-card">
            <div className="condition-head">
              <span className="mono">{closingCondition.code}</span>
              <StatusTag tone={conditionSeverityTone(closingCondition.severity)}>
                {t(CONDITION_SEVERITY_LABELS[closingCondition.severity])}
              </StatusTag>
              <StatusTag tone={conditionStatusTone(closingCondition.status)}>
                {t('Open')}
              </StatusTag>
            </div>
            <div className="condition-body">{closingCondition.description}</div>
            <div className="condition-meta">
              <span>{t('Owner {{name}}', { name: closingCondition.owner.name })}</span>
              <span>{t('Due {{date}}', { date: formatDate(closingCondition.dueDate) })}</span>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConditionDialog
        open={conditionOpen}
        onClose={() => setConditionOpen(false)}
        item={item}
        project={project}
        description={conditionDescription}
        setDescription={setConditionDescription}
        owner={conditionOwner}
        setOwner={setConditionOwner}
        due={conditionDue}
        setDue={setConditionDue}
        severity={conditionSeverity}
        setSeverity={setConditionSeverity}
        busy={busy === 'acceptance'}
        onSubmit={() => {
          if (!conditionDescription.trim()) {
            toast.warning(t('Enter a condition description'));
            return;
          }
          if (!conditionOwner) {
            toast.warning(t('Select a condition owner'));
            return;
          }
          void submitAcceptance('conditional', {
            description: conditionDescription.trim(),
            ownerId: conditionOwner,
            dueDate: conditionDue,
            severity: conditionSeverity,
          });
        }}
      />
    </>
  );
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="drawer-section-title">
      {children}
      {hint ? <span className="section-hint">{hint}</span> : null}
    </div>
  );
}

function ReviewPane({
  detail,
  project,
  memberByRole,
  gate,
  canEditRule,
  editingRule,
  ruleDraft,
  setRuleDraft,
  setEditingRule,
  saveRule,
  busy,
  canReview,
  reviewStage,
  reviewRemarks,
  setReviewRemarks,
  reviewEnv,
  setReviewEnv,
  reviewVersion,
  setReviewVersion,
  reviewReference,
  setReviewReference,
  submitReview,
  canAccept,
  acceptEnv,
  setAcceptEnv,
  acceptVersion,
  setAcceptVersion,
  acceptReference,
  setAcceptReference,
  acceptRemarks,
  setAcceptRemarks,
  onAccept,
  onConditional,
  isAccepted,
  currentUserId,
  onCloseCondition,
}: {
  detail: ItemDetail;
  project: ProjectDetail;
  memberByRole: Map<string, ProjectDetail['members'][number]>;
  gate: ItemDetail['gate'];
  canEditRule: boolean;
  editingRule: boolean;
  ruleDraft: string;
  setRuleDraft: (value: string) => void;
  setEditingRule: (value: boolean) => void;
  saveRule: () => Promise<void>;
  busy: string | null;
  canReview: boolean;
  reviewStage: ReviewStage | null;
  reviewRemarks: string;
  setReviewRemarks: (value: string) => void;
  reviewEnv: string;
  setReviewEnv: (value: string) => void;
  reviewVersion: string;
  setReviewVersion: (value: string) => void;
  reviewReference: string;
  setReviewReference: (value: string) => void;
  submitReview: (decision: ReviewDecision) => Promise<void>;
  canAccept: boolean;
  acceptEnv: string;
  setAcceptEnv: (value: string) => void;
  acceptVersion: string;
  setAcceptVersion: (value: string) => void;
  acceptReference: string;
  setAcceptReference: (value: string) => void;
  acceptRemarks: string;
  setAcceptRemarks: (value: string) => void;
  onAccept: (decision: AcceptanceDecision) => Promise<unknown>;
  onConditional: () => void;
  isAccepted: boolean;
  currentUserId: string;
  onCloseCondition: (condition: Condition) => void;
}) {
  const { t } = useI18n();
  const item = detail.item;
  const delivery = memberByRole.get('delivery');
  const core = memberByRole.get('core_reviewer');
  const business = memberByRole.get('business_reviewer');
  const receiver = memberByRole.get('receiver');

  function assignmentState(
    latest: typeof item.latestCore,
    positive: string,
  ): { label: string; tone: 'ok' | 'warn' | 'bad' } {
    if (!latest) return { label: 'Pending', tone: 'warn' };
    if (latest.decision === positive) return { label: reviewDecisionLabel(latest.stage, latest.decision), tone: 'ok' };
    if (latest.decision === 'returned') return { label: 'Returned', tone: 'bad' };
    if (latest.decision === 'failed') return { label: 'Failed', tone: 'bad' };
    return { label: 'Pending', tone: 'warn' };
  }

  const deliveryState =
    item.supplyStatus === 'submitted'
      ? { label: 'Submitted', tone: 'ok' as const }
      : item.supplyStatus === 'needs_information'
        ? { label: 'Needs information', tone: 'bad' as const }
        : { label: 'Awaiting submission', tone: 'warn' as const };
  const coreState = assignmentState(item.latestCore, 'passed');
  const businessState = assignmentState(item.latestBusiness, 'confirmed');
  const acceptedState = ['passed', 'conditional'].includes(item.acceptanceStatus)
    ? { label: ACCEPTANCE_LABELS[item.acceptanceStatus], tone: 'ok' as const }
    : item.acceptanceStatus === 'rejected'
      ? { label: 'Rejected', tone: 'bad' as const }
      : { label: 'Pending acceptance', tone: 'warn' as const };

  const records = [
    ...detail.reviews.map((review) => ({
      kind: 'review' as const,
      id: review.id,
      date: review.createdAt,
      data: review,
    })),
    ...detail.acceptances.map((acceptance) => ({
      kind: 'acceptance' as const,
      id: acceptance.id,
      date: acceptance.createdAt,
      data: acceptance,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <section>
        <SectionTitle>{t('Assignments')}</SectionTitle>
        <div className="assignment-list">
          <div className="assignment-row">
            <span className="assignment-role">{t(ROLE_LABELS.delivery)}</span>
            <span className="assignment-person">
              <Avatar name={delivery?.name ?? t('Unassigned')} size={20} />
              {delivery?.name ?? t('Unassigned')}
            </span>
            <span className={`assignment-state ${deliveryState.tone === 'ok' ? 'is-done' : deliveryState.tone === 'bad' ? 'is-failed' : ''}`}>
              {t(deliveryState.label)}
            </span>
          </div>
          {item.coreRequired ? (
            <div className="assignment-row">
              <span className="assignment-role">{t(ROLE_LABELS.core_reviewer)}</span>
              <span className="assignment-person">
                <Avatar name={core?.name ?? t('Unassigned')} size={20} />
                {core?.name ?? t('Unassigned')}
              </span>
              <span className={`assignment-state ${coreState.tone === 'ok' ? 'is-done' : coreState.tone === 'bad' ? 'is-failed' : ''}`}>
                {t(coreState.label)}
              </span>
            </div>
          ) : null}
          {item.businessRequired ? (
            <div className="assignment-row">
              <span className="assignment-role">{t(ROLE_LABELS.business_reviewer)}</span>
              <span className="assignment-person">
                <Avatar name={business?.name ?? t('Unassigned')} size={20} />
                {business?.name ?? t('Unassigned')}
              </span>
              <span className={`assignment-state ${businessState.tone === 'ok' ? 'is-done' : businessState.tone === 'bad' ? 'is-failed' : ''}`}>
                {t(businessState.label)}
              </span>
            </div>
          ) : null}
          <div className="assignment-row">
            <span className="assignment-role">{t(ROLE_LABELS.receiver)}</span>
            <span className="assignment-person">
              <Avatar name={receiver?.name ?? t('Unassigned')} size={20} />
              {receiver?.name ?? t('Unassigned')}
            </span>
            <span className={`assignment-state ${acceptedState.tone === 'ok' ? 'is-done' : acceptedState.tone === 'bad' ? 'is-failed' : ''}`}>
              {t(acceptedState.label)}
            </span>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>{t('Acceptance criteria')}</SectionTitle>
        {editingRule ? (
          <div className="rule-card is-editing">
            <Textarea
              value={ruleDraft}
              onChange={(event) => setRuleDraft(event.target.value)}
              aria-label={t('Acceptance criteria')}
            />
            <div className="rule-actions">
              <Button
                size="sm"
                variant="primary"
                onClick={() => void saveRule()}
                loading={busy === 'rule'}
              >
                {t('Save new revision')}
              </Button>
              <Button size="sm" onClick={() => setEditingRule(false)}>
                {t('Cancel')}
              </Button>
              <span className="action-hint">
                {t('Existing reviews and acceptance records will be invalidated.')}
              </span>
            </div>
          </div>
        ) : (
          <div className="rule-card">
            <p>{item.rule}</p>
            {canEditRule ? (
              <div className="rule-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setRuleDraft(item.rule);
                    setEditingRule(true);
                  }}
                >
                  {t('Edit acceptance criteria')}
                </button>
                <span className="rule-version">
                  {t('v{{revision}}', { revision: item.revision })}
                </span>
              </div>
            ) : (
              <div className="rule-actions">
                <span className="rule-version">
                  {t('v{{revision}}', { revision: item.revision })}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {detail.conditions.length ? (
        <section>
          <SectionTitle>{t('Conditions')}</SectionTitle>
          {detail.conditions.map((condition) => {
            const canClose =
              condition.status === 'open' &&
              (condition.owner.id === currentUserId || project.permissions.manageProject);
            return (
              <div className="condition-card" key={condition.id}>
                <div className="condition-head">
                  <span className="mono">{condition.code}</span>
                  <StatusTag tone={conditionSeverityTone(condition.severity)}>
                    {t(CONDITION_SEVERITY_LABELS[condition.severity])}
                  </StatusTag>
                  <StatusTag tone={conditionStatusTone(condition.status)}>
                    {condition.status === 'open' ? t('Open') : t('Closed')}
                  </StatusTag>
                </div>
                <div className="condition-body">{condition.description}</div>
                <div className="condition-meta">
                  <span>{t('Owner {{name}}', { name: condition.owner.name })}</span>
                  <span>{t('Due {{date}}', { date: formatDate(condition.dueDate) })}</span>
                  {canClose ? (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => onCloseCondition(condition)}
                    >
                      {t('Close condition')}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {canAccept && !isAccepted ? (
        <section>
          <SectionTitle>{t('Acceptance')}</SectionTitle>
          <div className={`action-card ${gate.ready ? 'is-ready' : 'is-blocked'}`}>
            <div className={`action-card-head ${gate.ready ? 'is-ready' : 'is-blocked'}`}>
              <Icon name={gate.ready ? 'checkCircle' : 'alert'} size={15} />
              {gate.ready ? t('Acceptance gate met') : t('Acceptance gate not met')}
            </div>
            {!gate.ready ? (
              <ul className="action-missing">
                {gate.missing.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            <div className="source-fields">
              <Input
                value={acceptEnv}
                onChange={(event) => setAcceptEnv(event.target.value)}
                placeholder={t('Environment (required, e.g. staging)')}
                aria-label={t('Environment')}
              />
              <Input
                value={acceptVersion}
                onChange={(event) => setAcceptVersion(event.target.value)}
                placeholder={t('Version (required, e.g. v2.3.1)')}
                aria-label={t('Version')}
              />
            </div>
            <Input
              value={acceptReference}
              onChange={(event) => setAcceptReference(event.target.value)}
              placeholder={t('Evidence reference (optional)')}
              aria-label={t('Evidence reference')}
            />
            <Textarea
              value={acceptRemarks}
              onChange={(event) => setAcceptRemarks(event.target.value)}
              placeholder={t('Notes (required when rejecting or not applicable)')}
              style={{ minHeight: 64 }}
              aria-label={t('Acceptance notes')}
            />
            <div className="action-buttons">
              <Button
                variant="primary"
                size="sm"
                disabled={!gate.ready}
                loading={busy === 'acceptance'}
                onClick={() => void onAccept('passed')}
              >
                {t('Accept')}
              </Button>
              <Button
                size="sm"
                disabled={!gate.ready}
                onClick={onConditional}
              >
                {t('Accept with condition…')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={busy === 'acceptance'}
                onClick={() => void onAccept('rejected')}
              >
                {t('Reject')}
              </Button>
              <Button
                size="sm"
                onClick={() => void onAccept('not_applicable')}
              >
                {t('Mark not applicable')}
              </Button>
            </div>
            <p className="action-hint">
              {t('Outcome is linked to the environment and version.')}
            </p>
          </div>
        </section>
      ) : null}

      {isAccepted ? (
        <div className="notice notice-neutral">
          <Icon name="checkCircle" size={14} />
          <span>
            {t(
              'Acceptance outcome: {{outcome}}. Edit the acceptance criteria to start a new revision.',
              { outcome: t(ACCEPTANCE_LABELS[item.acceptanceStatus]) },
            )}
          </span>
        </div>
      ) : null}

      {canReview && reviewStage && !isAccepted ? (
        <section>
          <SectionTitle>{t('Review')}</SectionTitle>
          <div className="action-card">
            <div className="action-card-head">
              <Icon name="shield" size={14} />
              {t(REVIEW_STAGE_LABELS[reviewStage])} ·{' '}
              {reviewStage === 'core' ? core?.name : business?.name}
            </div>
            <div className="source-fields">
              <Input
                value={reviewEnv}
                onChange={(event) => setReviewEnv(event.target.value)}
                placeholder={t('Environment (optional)')}
                aria-label={t('Review environment')}
              />
              <Input
                value={reviewVersion}
                onChange={(event) => setReviewVersion(event.target.value)}
                placeholder={t('Version (optional)')}
                aria-label={t('Review version')}
              />
            </div>
            <Input
              value={reviewReference}
              onChange={(event) => setReviewReference(event.target.value)}
              placeholder={t('Reference (optional)')}
              aria-label={t('Review reference')}
            />
            <Textarea
              value={reviewRemarks}
              onChange={(event) => setReviewRemarks(event.target.value)}
              placeholder={t('Notes (required when returning or failing)')}
              style={{ minHeight: 62 }}
              aria-label={t('Review notes')}
            />
            <div className="action-buttons">
              {reviewStage === 'core' ? (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === 'review'}
                    onClick={() => void submitReview('passed')}
                  >
                    {t('Pass review')}
                  </Button>
                  <Button
                    size="sm"
                    loading={busy === 'review'}
                    onClick={() => void submitReview('returned')}
                  >
                    {t('Return')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy === 'review'}
                    onClick={() => void submitReview('failed')}
                  >
                    {t('Fail review')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === 'review'}
                    onClick={() => void submitReview('confirmed')}
                  >
                    {t('Confirm')}
                  </Button>
                  <Button
                    size="sm"
                    loading={busy === 'review'}
                    onClick={() => void submitReview('returned')}
                  >
                    {t('Return')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>{t('Review & acceptance history')}</SectionTitle>
        {records.length ? (
          records.map((record) =>
            record.kind === 'review' ? (
              <div
                key={record.id}
                className={cn('review-record', !record.data.effective && 'is-invalid')}
              >
                <div className="review-record-head">
                  <StatusTag
                    tone={record.data.stage === 'core' ? 'slate' : 'amber'}
                  >
                    {t(REVIEW_STAGE_LABELS[record.data.stage])}
                  </StatusTag>
                  <StatusTag tone={reviewDecisionTone(record.data.decision)}>
                    {t(reviewDecisionLabel(record.data.stage, record.data.decision))}
                  </StatusTag>
                  <span className="review-by">{record.data.author.name}</span>
                  <span>{formatDateTime(record.data.createdAt)}</span>
                  {!record.data.effective ? (
                    <span className="tag tag-dim">
                      {t('v{{revision}} · Superseded', { revision: record.data.revision })}
                    </span>
                  ) : null}
                </div>
                {record.data.remarks ? (
                  <div className="review-record-body">{record.data.remarks}</div>
                ) : null}
                {record.data.environment || record.data.version || record.data.reference ? (
                  <div className="review-record-source">
                    {record.data.environment ? <span>{record.data.environment}</span> : null}
                    {record.data.version ? <span>· {record.data.version}</span> : null}
                    {record.data.reference ? <span>· {record.data.reference}</span> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                key={record.id}
                className={cn('review-record', !record.data.effective && 'is-invalid')}
              >
                <div className="review-record-head">
                  <StatusTag tone="blue">{t('Acceptance')}</StatusTag>
                  <StatusTag tone={acceptanceTone(record.data.decision)}>
                    {t(ACCEPTANCE_LABELS[record.data.decision])}
                  </StatusTag>
                  <span className="review-by">{record.data.reviewer.name}</span>
                  <span>{formatDateTime(record.data.createdAt)}</span>
                  {!record.data.effective ? (
                    <span className="tag tag-dim">
                      {t('v{{revision}} · Superseded', { revision: record.data.revision })}
                    </span>
                  ) : null}
                </div>
                {record.data.remarks ? (
                  <div className="review-record-body">{record.data.remarks}</div>
                ) : null}
                <div className="review-record-source">
                  {record.data.environment ? <span>{record.data.environment}</span> : null}
                  {record.data.version ? <span>· {record.data.version}</span> : null}
                  {record.data.reference ? <span>· {record.data.reference}</span> : null}
                </div>
              </div>
            ),
          )
        ) : (
          <div className="review-empty">{t('No reviews or acceptance records yet.')}</div>
        )}
      </section>
    </>
  );
}

function EvidencePane({
  detail,
  canSubmit,
  evidenceType,
  setEvidenceType,
  evidenceEnv,
  setEvidenceEnv,
  evidenceVersion,
  setEvidenceVersion,
  evidenceReference,
  setEvidenceReference,
  evidenceDescription,
  setEvidenceDescription,
  submit,
  busy,
}: {
  detail: ItemDetail;
  canSubmit: boolean;
  evidenceType: EvidenceType;
  setEvidenceType: (value: EvidenceType) => void;
  evidenceEnv: string;
  setEvidenceEnv: (value: string) => void;
  evidenceVersion: string;
  setEvidenceVersion: (value: string) => void;
  evidenceReference: string;
  setEvidenceReference: (value: string) => void;
  evidenceDescription: string;
  setEvidenceDescription: (value: string) => void;
  submit: () => Promise<void>;
  busy: string | null;
}) {
  const { t } = useI18n();
  return (
    <>
      <section>
        <SectionTitle>{t('Evidence')}</SectionTitle>
        {detail.evidence.length ? (
          detail.evidence.map((evidence) => (
            <div className="evidence-card" key={evidence.id}>
              <div className="evidence-head">
                <StatusTag tone="slate">{t(EVIDENCE_TYPE_LABELS[evidence.type])}</StatusTag>
                {evidence.version ? <span className="mono">{evidence.version}</span> : null}
                {evidence.environment ? <span>· {evidence.environment}</span> : null}
                <span className="evidence-by">
                  {evidence.author.name} · {formatDateTime(evidence.createdAt)}
                </span>
              </div>
              <div className="evidence-text">{evidence.description}</div>
              {evidence.reference ? (
                <div className="evidence-ref">
                  <Icon name="link" size={11} />
                  {evidence.reference}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="drawer-empty">{t('No evidence submitted yet.')}</div>
        )}
      </section>
      {canSubmit ? (
        <section className="note-form">
          <div className="form-section-title">
            <Icon name="plus" size={13} />
            {t('Submit evidence')}
          </div>
          <div className="source-fields">
            <Select
              value={evidenceType}
              onChange={(event) => setEvidenceType(event.target.value as EvidenceType)}
              aria-label={t('Evidence type')}
            >
              {EVIDENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(EVIDENCE_TYPE_LABELS[type])}
                </option>
              ))}
            </Select>
            <Input
              value={evidenceVersion}
              onChange={(event) => setEvidenceVersion(event.target.value)}
              placeholder={t('Version (e.g. v2.3.1)')}
              aria-label={t('Evidence version')}
            />
          </div>
          <Input
            value={evidenceEnv}
            onChange={(event) => setEvidenceEnv(event.target.value)}
            placeholder={t('Environment (e.g. staging)')}
            aria-label={t('Evidence environment')}
          />
          <Input
            value={evidenceReference}
            onChange={(event) => setEvidenceReference(event.target.value)}
            placeholder={t('File or path reference (e.g. docs/design.md)')}
            aria-label={t('Evidence reference')}
          />
          <Textarea
            value={evidenceDescription}
            onChange={(event) => setEvidenceDescription(event.target.value)}
            placeholder={t('Description (required): what this evidence shows.')}
          />
          <div className="form-actions">
            <Button
              variant="primary"
              size="sm"
              loading={busy === 'evidence'}
              onClick={() => void submit()}
            >
              {t('Submit evidence')}
            </Button>
          </div>
        </section>
      ) : (
        <div className="notice notice-neutral">
          <Icon name="info" size={14} />
          <span>{t('Only the delivery role can submit evidence.')}</span>
        </div>
      )}
    </>
  );
}

function NotesPane({
  detail,
  project,
  canComment,
  noteBody,
  setNoteBody,
  noteIsQuestion,
  setNoteIsQuestion,
  noteAssignee,
  setNoteAssignee,
  submit,
  busy,
  currentUserId,
  onAnswer,
}: {
  detail: ItemDetail;
  project: ProjectDetail;
  canComment: boolean;
  noteBody: string;
  setNoteBody: (value: string) => void;
  noteIsQuestion: boolean;
  setNoteIsQuestion: (value: boolean) => void;
  noteAssignee: string;
  setNoteAssignee: (value: string) => void;
  submit: () => Promise<void>;
  busy: string | null;
  currentUserId: string;
  onAnswer: (note: Note) => void;
}) {
  const { t } = useI18n();
  const answersByParent = new Map<string, Note[]>();
  for (const note of detail.notes) {
    if (note.kind === 'answer' && note.parentId) {
      const list = answersByParent.get(note.parentId) ?? [];
      list.push(note);
      answersByParent.set(note.parentId, list);
    }
  }
  const rootNotes = detail.notes.filter((note) => note.kind !== 'answer');

  return (
    <>
      <section>
        <SectionTitle>{t('Discussion')}</SectionTitle>
        {rootNotes.length ? (
          rootNotes.map((note) => (
            <div key={note.id}>
              <div className="comment-item">
                <Avatar name={note.author.name} size={24} />
                <div className="comment-body">
                  <div className="comment-head">
                    <span className="comment-author">{note.author.name}</span>
                    <span>{formatDateTime(note.createdAt)}</span>
                    {note.kind === 'question' ? (
                      note.answeredAt ? (
                        <StatusTag tone="green">{t('Answered')}</StatusTag>
                      ) : (
                        <StatusTag tone="amber">{t('Awaiting answer')}</StatusTag>
                      )
                    ) : null}
                    {note.assignee ? (
                      <span className="comment-meta">
                        {t('Assignee {{name}}', { name: note.assignee.name })}
                      </span>
                    ) : null}
                    {note.kind === 'question' &&
                    !note.answeredAt &&
                    note.assignee?.id === currentUserId ? (
                      <button
                        type="button"
                        className="text-link"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => onAnswer(note)}
                      >
                        {t('Answer')}
                      </button>
                    ) : null}
                  </div>
                  <div className="comment-text">{note.body}</div>
                </div>
              </div>
              {(answersByParent.get(note.id) ?? []).map((answer) => (
                <div className="comment-item comment-reply" key={answer.id}>
                  <Avatar name={answer.author.name} size={22} />
                  <div className="comment-body">
                    <div className="comment-head">
                      <span className="comment-author">{answer.author.name}</span>
                      <span>{formatDateTime(answer.createdAt)}</span>
                    </div>
                    <div className="comment-text">{answer.body}</div>
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="drawer-empty">{t('No discussion yet.')}</div>
        )}
      </section>

      {canComment ? (
        <section className="note-form">
          <div className="form-section-title">
            <Icon name="edit" size={13} />
            {t('Post')}
          </div>
          <Textarea
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            placeholder={t('Comment or question')}
            style={{ minHeight: 64 }}
          />
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={noteIsQuestion}
                onChange={(event) => setNoteIsQuestion(event.target.checked)}
              />
              {t('Mark as question')}
            </label>
            {noteIsQuestion ? (
              <span className="inline-assignee">
                {t('Assignee')}
                <Select
                  value={noteAssignee}
                  onChange={(event) => setNoteAssignee(event.target.value)}
                  aria-label={t('Question assignee')}
                >
                  <option value="">{t('Select')}</option>
                  {project.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name} · {t(ROLE_LABELS[member.role])}
                    </option>
                  ))}
                </Select>
              </span>
            ) : null}
          </div>
          <div className="form-actions">
            <Button
              variant="primary"
              size="sm"
              loading={busy === 'note'}
              onClick={() => void submit()}
            >
              {t('Post')}
            </Button>
          </div>
        </section>
      ) : (
        <div className="notice notice-neutral">
          <Icon name="lock" size={14} />
          <span>{t('You must be an active project member to post.')}</span>
        </div>
      )}
    </>
  );
}

function LogPane({ detail }: { detail: ItemDetail }) {
  const { t } = useI18n();
  return (
    <section>
      <SectionTitle>{t('History')}</SectionTitle>
      {detail.events.length ? (
        <div className="event-timeline">
          {detail.events.map((event) => (
            <div className="event-item" key={event.id}>
              <div className="event-head">
                <span>{formatDateTime(event.createdAt)}</span>
                <span className="event-actor">{event.actor.name}</span>
              </div>
              <div className="event-text">{event.detail}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="drawer-empty">{t('No activity yet.')}</div>
      )}
    </section>
  );
}

function ConditionDialog({
  open,
  onClose,
  item,
  project,
  description,
  setDescription,
  owner,
  setOwner,
  due,
  setDue,
  severity,
  setSeverity,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  item: ItemDetail['item'] | undefined;
  project: ProjectDetail;
  description: string;
  setDescription: (value: string) => void;
  owner: string;
  setOwner: (value: string) => void;
  due: string;
  setDue: (value: string) => void;
  severity: ConditionSeverity;
  setSeverity: (value: ConditionSeverity) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('Accept with condition')}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={onSubmit} loading={busy}>
            {t('Confirm acceptance')}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <div className="form-section-title">
          {item
            ? t('{{code}} · Acceptance criteria v{{revision}}', {
                code: item.code,
                revision: item.revision,
              })
            : null}
        </div>
        <Field label={t('Condition')} htmlFor="condition-description" required>
          <Textarea
            id="condition-description"
            data-autofocus
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('What remains open and what evidence will close it.')}
          />
        </Field>
        <div className="form-row">
          <Field label={t('Owner')} htmlFor="condition-owner" required>
            <Select
              id="condition-owner"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="">{t('Select')}</option>
              {project.members
                .filter((member) => member.role !== 'observer')
                .map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} · {t(ROLE_LABELS[member.role])}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={t('Severity')} htmlFor="condition-severity" required>
            <Select
              id="condition-severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as ConditionSeverity)}
            >
              {Object.entries(CONDITION_SEVERITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('Due date')} htmlFor="condition-due" required>
          <Input
            id="condition-due"
            type="date"
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}

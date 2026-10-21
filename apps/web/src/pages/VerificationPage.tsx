import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { RiskSeverity, Step, StepStatus } from '@throughline/shared';

import { Dialog } from '../components/Dialog';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormRow,
  Input,
  LoadingState,
  Select,
  StatusTag,
  Textarea,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { addDaysInput, cn, formatDate, formatDateTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import {
  RISK_SEVERITY_LABELS,
  ROLE_LABELS,
  STEP_STATUS_LABELS,
  stepStatusTone,
} from '../lib/labels';
import { useToast } from '../lib/toast';
import { useProject } from './ProjectShell';

interface RiskDraft {
  severity: RiskSeverity;
  ownerId: string;
  dueDate: string;
  title: string;
}

const EMPTY_RISK: RiskDraft = { severity: 'medium', ownerId: '', dueDate: '', title: '' };

export function VerificationPage() {
  const project = useProject();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const [resultStep, setResultStep] = useState<Step | null>(null);
  const [status, setStatus] = useState<StepStatus>('passed');
  const [environment, setEnvironment] = useState(t('Test environment · masked data'));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [raiseRisk, setRaiseRisk] = useState(false);
  const [risk, setRisk] = useState<RiskDraft>(EMPTY_RISK);
  const [scopeStep, setScopeStep] = useState<Step | null>(null);
  const [scopeItems, setScopeItems] = useState<string[]>([]);
  const [scopeChains, setScopeChains] = useState<string[]>([]);
  const [scopeBusy, setScopeBusy] = useState(false);

  const canManage =
    project.permissions.recordVerification &&
    project.status === 'active' &&
    project.stage !== 'closed';

  const stepsQuery = useQuery({
    queryKey: ['steps', project.id],
    queryFn: () => api.steps.list(project.id),
  });

  const catalogQuery = useQuery({
    queryKey: ['items', project.id, { scope: true }],
    queryFn: () => api.items.list(project.id, { pageSize: 200 }),
    enabled: canManage,
    placeholderData: (previous) => previous,
  });

  const chainsQuery = useQuery({
    queryKey: ['chains', project.id],
    queryFn: () => api.chains.list(project.id),
    enabled: canManage,
  });

  const steps = stepsQuery.data ?? [];
  const ownerOptions = project.members.filter((member) => member.role !== 'observer');
  const passed = steps.filter((step) => step.status === 'passed' && !step.stale).length;
  const stale = steps.filter((step) => step.stale).length;

  useEffect(() => {
    if (!focusId || !steps.length) return;
    const target = document.getElementById(`step-${focusId}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, steps.length]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['steps', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['report', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['risks', project.id] });
  }

  function openResult(step: Step) {
    setResultStep(step);
    setStatus(step.status === 'pending' ? 'passed' : step.status);
    setEnvironment(step.environment || t('Test environment · masked data'));
    setNote(step.note || '');
    setRaiseRisk(false);
    setRisk({ ...EMPTY_RISK, ownerId: ownerOptions[0]?.userId ?? '', dueDate: addDaysInput(10) });
  }

  function openScope(step: Step) {
    setScopeStep(step);
    setScopeItems(step.items.map((item) => item.id));
    setScopeChains(step.mappings.map((mapping) => mapping.id));
  }

  function openNext() {
    const next = steps.find((step) => step.status !== 'passed' || step.stale) ?? steps[0];
    if (next) openResult(next);
  }

  async function saveResult() {
    if (!resultStep) return;
    if (!note.trim()) {
      toast.warning(t('Enter a result note'));
      return;
    }
    if (status === 'failed' && raiseRisk && !risk.ownerId) {
      toast.warning(t('Select a risk owner'));
      return;
    }
    if (status === 'failed' && raiseRisk && !risk.dueDate) {
      toast.warning(t('Select a due date'));
      return;
    }
    setBusy(true);
    try {
      const result = await api.steps.record(resultStep.id, {
        status,
        note: note.trim(),
        environment: environment.trim(),
        risk:
          status === 'failed' && raiseRisk
            ? {
                severity: risk.severity,
                ownerId: risk.ownerId,
                dueDate: risk.dueDate,
                title: risk.title.trim(),
              }
            : undefined,
      });
      setResultStep(null);
      invalidate();
      toast.success(
        result.riskCode
          ? t('Risk {{code}} raised from this failure', { code: result.riskCode })
          : t('Verification result recorded'),
      );
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveScope() {
    if (!scopeStep) return;
    setScopeBusy(true);
    try {
      await api.steps.updateScope(scopeStep.id, {
        itemIds: scopeItems,
        chainIds: scopeChains,
      });
      setScopeStep(null);
      invalidate();
      toast.success(t('Verification scope updated'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setScopeBusy(false);
    }
  }

  async function createStep() {
    if (newStepName.trim().length < 2) {
      toast.warning(t('Step name is too short'));
      return;
    }
    setAddBusy(true);
    try {
      await api.steps.create(project.id, { name: newStepName.trim() });
      setAddOpen(false);
      setNewStepName('');
      invalidate();
      toast.success(t('Verification step added'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">{t('End-to-end verification')}</span>
          <div className="panel-actions">
            <StatusTag tone={passed === steps.length && steps.length > 0 ? 'green' : 'blue'}>
              {t('{{passed}} / {{total}} verified', { passed, total: steps.length })}
            </StatusTag>
            {stale ? (
              <StatusTag tone="amber">
                {t('{{count}} need re-verification', { count: stale })}
              </StatusTag>
            ) : null}
            {canManage ? (
              <>
                <Button size="sm" onClick={() => setAddOpen(true)} iconLeft="plus">
                  {t('Add step')}
                </Button>
                {steps.length ? (
                  <Button size="sm" variant="primary" onClick={openNext}>
                    {t('Record next result')}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {stepsQuery.isPending ? (
          <LoadingState label={t('Loading verification steps…')} />
        ) : stepsQuery.isError ? (
          <ErrorState
            message={describeError(stepsQuery.error)}
            onRetry={() => void stepsQuery.refetch()}
          />
        ) : steps.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title={t('No verification steps yet')}
            description={t('Add the first end-to-end step to verify a core workflow.')}
            action={
              canManage ? (
                <Button variant="primary" iconLeft="plus" onClick={() => setAddOpen(true)}>
                  {t('Add step')}
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="verification-list">
            {steps.map((step) => (
              <div
                key={step.id}
                id={`step-${step.id}`}
                className={cn(
                  'verification-step',
                  `is-${step.status}`,
                  step.stale && 'is-stale',
                  focusId === step.id && 'is-focused',
                )}
              >
                <span className="verification-index">{step.position}</span>
                <div className="verification-copy">
                  <div className="verification-title">{step.name}</div>
                  <div className="verification-links">
                    <span>{t('Linked items')}</span>
                    {step.items.length ? (
                      step.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="text-link mono"
                          onClick={() => navigate(`/projects/${project.id}/items?focus=${item.id}`)}
                        >
                          {item.code}
                        </button>
                      ))
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </div>
                  <div className="verification-links">
                    <span>{t('Linked pages')}</span>
                    {step.mappings.length ? (
                      step.mappings.map((mapping) => (
                        <button
                          key={mapping.id}
                          type="button"
                          className="text-link mono"
                          onClick={() =>
                            navigate(`/projects/${project.id}/graph?focus=${mapping.id}`)
                          }
                        >
                          {mapping.page}
                        </button>
                      ))
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </div>
                  {step.stale ? (
                    <div className="verification-stale">
                      {t('A linked item or page mapping changed after this pass was recorded.')}
                    </div>
                  ) : null}
                  {step.recordedAt ? (
                    <div className="verification-record">
                      <div className="verification-record-head">
                        {step.recordedBy?.name ?? t('Verifier')} · {formatDateTime(step.recordedAt)}{' '}
                        · {step.environment || t('Environment not specified')}
                      </div>
                      {step.note || t('No result note')}
                    </div>
                  ) : step.note ? (
                    <div className="hint" style={{ marginTop: 5 }}>
                      {step.note}
                    </div>
                  ) : null}
                </div>
                <div className="verification-side">
                  <StatusTag tone={step.stale ? 'amber' : stepStatusTone(step.status)}>
                    {step.stale ? t('Needs re-verification') : t(STEP_STATUS_LABELS[step.status])}
                  </StatusTag>
                  {canManage ? (
                    <>
                      <button type="button" className="text-link" onClick={() => openResult(step)}>
                        {t('Record result')}
                      </button>
                      <button type="button" className="text-link" onClick={() => openScope(step)}>
                        {t('Set scope')}
                      </button>
                    </>
                  ) : null}
                  {step.recordedAt ? (
                    <span className="faint" style={{ fontSize: 10 }}>
                      {formatDate(step.recordedAt, true)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(resultStep)}
        onClose={() => setResultStep(null)}
        title={
          resultStep
            ? t('Record result · Step {{position}}', { position: resultStep.position })
            : t('Record result')
        }
        description={resultStep?.name}
        size="md"
        footer={
          <>
            <Button onClick={() => setResultStep(null)}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={() => void saveResult()} loading={busy}>
              {t('Save result')}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="form-row">
            <Field label={t('Outcome')} htmlFor="step-status" required>
              <select
                id="step-status"
                className="select"
                value={status}
                onChange={(event) => setStatus(event.target.value as StepStatus)}
              >
                {Object.entries(STEP_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Environment')} htmlFor="step-env">
              <Input
                id="step-env"
                value={environment}
                onChange={(event) => setEnvironment(event.target.value)}
                placeholder={t('Test environment · masked data')}
              />
            </Field>
          </div>
          <Field
            label={t('Result note')}
            htmlFor="step-note"
            required
            hint={t('What you verified and found.')}
          >
            <Textarea
              id="step-note"
              data-autofocus
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t(
                'e.g. Submit, review, return, and resubmit passed end to end; notifications delivered.',
              )}
            />
          </Field>
          {status === 'failed' ? (
            <div className="verification-risk-block">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={raiseRisk}
                  onChange={(event) => setRaiseRisk(event.target.checked)}
                />
                <span>{t('Raise a risk from this failure')}</span>
              </label>
              {raiseRisk ? (
                <>
                  <FormRow>
                    <Field label={t('Severity')} htmlFor="risk-severity">
                      <Select
                        id="risk-severity"
                        value={risk.severity}
                        onChange={(event) =>
                          setRisk((prev) => ({
                            ...prev,
                            severity: event.target.value as RiskSeverity,
                          }))
                        }
                      >
                        {Object.entries(RISK_SEVERITY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {t(label)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('Owner')} htmlFor="risk-owner" required>
                      <Select
                        id="risk-owner"
                        value={risk.ownerId}
                        onChange={(event) =>
                          setRisk((prev) => ({ ...prev, ownerId: event.target.value }))
                        }
                      >
                        <option value="">{t('Select…')}</option>
                        {ownerOptions.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name} · {t(ROLE_LABELS[member.role])}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FormRow>
                  <FormRow>
                    <Field label={t('Due date')} htmlFor="risk-due" required>
                      <Input
                        id="risk-due"
                        type="date"
                        value={risk.dueDate}
                        onChange={(event) =>
                          setRisk((prev) => ({ ...prev, dueDate: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t('Risk title')} htmlFor="risk-title" hint={t('Optional.')}>
                      <Input
                        id="risk-title"
                        value={risk.title}
                        onChange={(event) =>
                          setRisk((prev) => ({ ...prev, title: event.target.value }))
                        }
                        placeholder={t('End-to-end step failed: step name')}
                      />
                    </Field>
                  </FormRow>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={Boolean(scopeStep)}
        onClose={() => setScopeStep(null)}
        title={t('Verification scope')}
        description={scopeStep?.name}
        size="md"
        footer={
          <>
            <Button onClick={() => setScopeStep(null)}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={() => void saveScope()} loading={scopeBusy}>
              {t('Save')}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Field label={t('Work items')} htmlFor="scope-items">
            <div className="scope-list" id="scope-items">
              {catalogQuery.isPending ? (
                <LoadingState label={t('Loading…')} />
              ) : (catalogQuery.data?.items.length ?? 0) === 0 ? (
                <span className="faint">{t('No work items yet')}</span>
              ) : (
                (catalogQuery.data?.items ?? []).map((item) => (
                  <label key={item.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={scopeItems.includes(item.id)}
                      onChange={(event) =>
                        setScopeItems((prev) =>
                          event.target.checked
                            ? [...prev, item.id]
                            : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span className="mono">{item.code}</span>
                    <span>{item.title}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
          <Field label={t('Page mappings')} htmlFor="scope-chains">
            <div className="scope-list" id="scope-chains">
              {(chainsQuery.data?.length ?? 0) === 0 ? (
                <span className="faint">{t('No mappings yet')}</span>
              ) : (
                (chainsQuery.data ?? []).map((chain) => (
                  <label key={chain.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={scopeChains.includes(chain.id)}
                      onChange={(event) =>
                        setScopeChains((prev) =>
                          event.target.checked
                            ? [...prev, chain.id]
                            : prev.filter((id) => id !== chain.id),
                        )
                      }
                    />
                    <span className="mono">{chain.page}</span>
                    <span>{chain.title || t('Untitled page')}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
          <p className="hint">
            {t('A recorded pass is flagged when anything in its scope changes.')}
          </p>
        </div>
      </Dialog>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('Add verification step')}
        description={t('Cover one reproducible workflow.')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={() => void createStep()} loading={addBusy}>
              {t('Add step')}
            </Button>
          </>
        }
      >
        <Field label={t('Step name')} htmlFor="new-step-name" required>
          <Input
            id="new-step-name"
            data-autofocus
            value={newStepName}
            onChange={(event) => setNewStepName(event.target.value)}
            placeholder={t('e.g. Failure and recovery path')}
          />
        </Field>
      </Dialog>
    </>
  );
}

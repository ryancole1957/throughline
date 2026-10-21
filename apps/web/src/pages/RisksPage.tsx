import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Risk, RiskAction, RiskSeverity } from '@throughline/shared';

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
import { useAuth } from '../lib/auth';
import { addDaysInput, dueLabel, formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import {
  RISK_ACTION_LABELS,
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
  ROLE_LABELS,
  riskSeverityTone,
  riskStatusTone,
} from '../lib/labels';
import { useToast } from '../lib/toast';
import { useProject } from './ProjectShell';

interface RiskActionOption {
  action: RiskAction;
  label: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  requireNote?: boolean;
  hint?: string;
}

export function RisksPage() {
  const project = useProject();
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const [selected, setSelected] = useState<Risk | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    severity: 'medium' as RiskSeverity,
    ownerId: '',
    dueDate: addDaysInput(10),
    impact: '',
    mitigation: '',
    itemId: '',
  });

  const risksQuery = useQuery({
    queryKey: ['risks', project.id],
    queryFn: () => api.risks.list(project.id),
  });
  const itemsQuery = useQuery({
    queryKey: ['items', project.id, 'risk-options'],
    queryFn: () => api.items.list(project.id, { pageSize: 200 }),
    enabled: createOpen,
  });

  const risks = useMemo(() => risksQuery.data ?? [], [risksQuery.data]);
  const openRisks = risks.filter((risk) => risk.status !== 'closed');
  const closedRisks = risks.filter((risk) => risk.status === 'closed');
  const writable = project.status === 'active' && project.stage !== 'closed';
  const canCreate =
    writable && (project.isAdmin || (project.myRole !== null && project.myRole !== 'observer'));
  const manager = project.permissions.manageProject;

  const ownerOptions = useMemo(
    () => project.members.filter((member) => member.role !== 'observer'),
    [project.members],
  );

  useEffect(() => {
    if (!focusId || !risks.length) return;
    const target = risks.find((risk) => risk.id === focusId);
    if (target) {
      // Opening a deep-linked risk is intentionally an external-to-React sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(target);
      document
        .getElementById(`risk-${target.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusId, risks]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['risks', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['report', project.id] });
  }

  function actionsFor(risk: Risk): RiskActionOption[] {
    if (!user) return [];
    const owner = risk.owner.id === user.id;
    const options: RiskActionOption[] = [];
    if (risk.status === 'open' && (owner || manager)) {
      options.push({
        action: 'start',
        label: RISK_ACTION_LABELS.start,
        variant: 'primary',
      });
    }
    if (risk.status === 'in_progress' && (owner || manager)) {
      options.push({
        action: 'mitigate',
        label: RISK_ACTION_LABELS.mitigate,
        variant: 'primary',
      });
      options.push({
        action: 'escalate',
        label: RISK_ACTION_LABELS.escalate,
        variant: 'secondary',
        requireNote: true,
        hint: 'Explain why a decision is needed.',
      });
    }
    if (risk.status === 'escalated' && manager) {
      options.push({
        action: 'back',
        label: RISK_ACTION_LABELS.back,
        variant: 'secondary',
        requireNote: true,
      });
      options.push({
        action: 'approve',
        label: RISK_ACTION_LABELS.approve,
        variant: 'danger',
        requireNote: true,
        hint: 'Recorded in the report as an exception approval.',
      });
    }
    if (risk.status === 'mitigated' && manager) {
      options.push({
        action: 'close',
        label: RISK_ACTION_LABELS.close,
        variant: 'primary',
      });
    }
    return options;
  }

  async function transition(risk: Risk, option: RiskActionOption) {
    if (option.requireNote && !transitionNote.trim()) {
      toast.warning(t('A note is required.'));
      return;
    }
    setBusy(true);
    try {
      const updated = await api.risks.transition(risk.id, option.action, transitionNote.trim());
      setSelected(updated);
      setTransitionNote('');
      invalidate();
      toast.success(
        t('Risk updated: {{status}}', {
          status: t(RISK_STATUS_LABELS[updated.status]),
        }),
      );
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createRisk() {
    if (form.title.trim().length < 3) {
      toast.warning(t('Enter a risk description.'));
      return;
    }
    if (!form.ownerId) {
      toast.warning(t('Select a risk owner.'));
      return;
    }
    setBusy(true);
    try {
      const risk = await api.risks.create(project.id, {
        title: form.title.trim(),
        severity: form.severity,
        ownerId: form.ownerId,
        dueDate: form.dueDate,
        impact: form.impact.trim(),
        mitigation: form.mitigation.trim(),
        itemIds: form.itemId ? [form.itemId] : [],
      });
      setCreateOpen(false);
      setForm({
        title: '',
        severity: 'medium',
        ownerId: '',
        dueDate: addDaysInput(10),
        impact: '',
        mitigation: '',
        itemId: '',
      });
      invalidate();
      setSelected(risk);
      toast.success(t('Risk logged'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  const actions = selected ? actionsFor(selected) : [];

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">{t('Open risks')}</span>
          <div className="panel-actions">
            {canCreate ? (
              <Button
                size="sm"
                variant="primary"
                iconLeft="plus"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    ownerId: prev.ownerId || ownerOptions[0]?.userId || '',
                  }));
                  setCreateOpen(true);
                }}
              >
                {t('Log risk')}
              </Button>
            ) : null}
          </div>
        </div>
        {risksQuery.isPending ? (
          <LoadingState label={t('Loading risks…')} />
        ) : risksQuery.isError ? (
          <ErrorState
            message={describeError(risksQuery.error)}
            onRetry={() => void risksQuery.refetch()}
          />
        ) : openRisks.length === 0 ? (
          <EmptyState
            icon="alert"
            title={t('No open risks')}
            description={t('Log risks with an owner and due date.')}
            action={
              canCreate ? (
                <Button variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
                  {t('Log risk')}
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="panel-body-flush table-responsive">
            <table className="data-table risk-table">
              <thead>
                <tr>
                  <th style={{ width: 58 }}>{t('ID')}</th>
                  <th>{t('Risk')}</th>
                  <th style={{ width: 56 }}>{t('Severity')}</th>
                  <th style={{ width: 112 }}>{t('Status')}</th>
                  <th style={{ width: 72 }}>{t('Owner')}</th>
                  <th style={{ width: 84 }}>{t('Due')}</th>
                  <th style={{ width: 150 }}>{t('Items')}</th>
                </tr>
              </thead>
              <tbody>
                {openRisks.map((risk) => (
                  <RiskRow
                    key={risk.id}
                    risk={risk}
                    focused={focusId === risk.id}
                    onOpen={() => {
                      setSelected(risk);
                      setTransitionNote('');
                    }}
                    onItem={(itemId) => navigate(`/projects/${project.id}/items?focus=${itemId}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {closedRisks.length ? (
        <div className="panel risk-closed">
          <div className="panel-header">
            <span className="panel-title">{t('Closed risks')}</span>
            <span className="panel-description">
              {t('{{count}} total', { count: closedRisks.length })}
            </span>
          </div>
          <div className="panel-body-flush table-responsive">
            <table className="data-table risk-table">
              <tbody>
                {closedRisks.map((risk) => (
                  <tr
                    key={risk.id}
                    className="row-interactive"
                    onClick={() => {
                      setSelected(risk);
                      setTransitionNote('');
                    }}
                  >
                    <td className="cell-code" style={{ width: 58 }}>
                      {risk.code}
                    </td>
                    <td>
                      <div className="risk-title">{risk.title}</div>
                    </td>
                    <td style={{ width: 72 }}>{risk.owner.name}</td>
                    <td style={{ width: 92 }}>
                      <StatusTag tone="gray">{t(RISK_STATUS_LABELS.closed)}</StatusTag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title}
        description={
          selected ? (
            <div className="risk-detail-meta" style={{ marginTop: 4 }}>
              <span className="mono">{selected.code}</span>
              <StatusTag tone={riskSeverityTone(selected.severity)}>
                {t(RISK_SEVERITY_LABELS[selected.severity])}
              </StatusTag>
              <StatusTag tone={riskStatusTone(selected.status)}>
                {t(RISK_STATUS_LABELS[selected.status])}
              </StatusTag>
              <span>{t('Owner {{name}}', { name: selected.owner.name })}</span>
              <span>{t('Due {{date}}', { date: formatDate(selected.dueDate) })}</span>
            </div>
          ) : null
        }
        size="lg"
      >
        {selected ? (
          <>
            <div className="detail-grid" style={{ gap: 22 }}>
              <div>
                <div className="risk-detail-section">
                  <div className="risk-detail-label">{t('Impact')}</div>
                  <div className="risk-detail-text">{selected.impact || t('Not provided')}</div>
                </div>
                <div className="risk-detail-section">
                  <div className="risk-detail-label">{t('Mitigation')}</div>
                  <div className="risk-detail-text">{selected.mitigation || t('Not provided')}</div>
                </div>
                <div className="risk-detail-section">
                  <div className="risk-detail-label">{t('Progress')}</div>
                  <div className="risk-detail-text">{selected.progress || t('No updates yet')}</div>
                </div>
                {selected.exceptionNote ? (
                  <div className="risk-detail-section">
                    <div className="risk-detail-label">{t('Exception approval')}</div>
                    <div className="risk-detail-text">
                      {selected.exceptionNote}
                      <div className="faint small">
                        {t('Approved by {{name}}', { name: selected.exceptionBy })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div>
                <div className="risk-detail-section">
                  <div className="risk-detail-label">{t('Linked items')}</div>
                  {selected.items.length ? (
                    <div className="tag-list">
                      {selected.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="chip chip-button"
                          onClick={() => navigate(`/projects/${project.id}/items?focus=${item.id}`)}
                        >
                          <Icon name="list" size={10} />
                          {item.code}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="risk-detail-text faint">{t('No linked items')}</div>
                  )}
                </div>
                <div className="risk-detail-section">
                  <div className="risk-detail-label">{t('Due')}</div>
                  <div className="risk-detail-text">
                    {formatDate(selected.dueDate)} · {dueLabel(selected.dueDate)}
                  </div>
                </div>
                {selected.status === 'closed' ? (
                  <div className="risk-detail-section">
                    <div className="risk-detail-label">{t('Status')}</div>
                    <div className="risk-detail-text">
                      {t('Closed; retained in the risk log and report.')}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {actions.length ? (
              <div className="risk-transition-box">
                <div className="form-section-title">
                  <Icon name="flag" size={13} />
                  {t('Status actions')}
                </div>
                <Textarea
                  value={transitionNote}
                  onChange={(event) => setTransitionNote(event.target.value)}
                  placeholder={t(
                    'Note (required to escalate, return, or approve an exception)',
                  )}
                  style={{ minHeight: 62 }}
                  aria-label={t('Note')}
                />
                <div className="risk-transition-actions">
                  {actions.map((option) => (
                    <Button
                      key={option.action}
                      size="sm"
                      variant={option.variant}
                      loading={busy}
                      onClick={() => void transition(selected, option)}
                    >
                      {t(option.label)}
                    </Button>
                  ))}
                </div>
                <p className="action-hint">
                  {t(
                    actions.find((option) => option.requireNote)?.hint ??
                      'All status changes are appended to the project record.',
                  )}
                </p>
              </div>
            ) : (
              <div className="notice notice-neutral" style={{ marginTop: 16 }}>
                <Icon name="info" size={14} />
                <span>{t('No actions available for this status.')}</span>
              </div>
            )}
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('Log risk')}
        description={t('Describe the risk, assign an owner and due date.')}
        size="lg"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={() => void createRisk()} loading={busy}>
              {t('Log risk')}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Field label={t('Risk description')} htmlFor="risk-title" required>
            <Input
              id="risk-title"
              data-autofocus
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder={t('State the risk and what it affects.')}
            />
          </Field>
          <FormRow>
            <Field label={t('Severity')} htmlFor="risk-severity">
              <Select
                id="risk-severity"
                value={form.severity}
                onChange={(event) =>
                  setForm((prev) => ({
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
                value={form.ownerId}
                onChange={(event) => setForm((prev) => ({ ...prev, ownerId: event.target.value }))}
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
                value={form.dueDate}
                onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </Field>
            <Field label={t('Linked item')} htmlFor="risk-item">
              <Select
                id="risk-item"
                value={form.itemId}
                onChange={(event) => setForm((prev) => ({ ...prev, itemId: event.target.value }))}
              >
                <option value="">{t('None')}</option>
                {(itemsQuery.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} {item.title.slice(0, 20)}
                  </option>
                ))}
              </Select>
            </Field>
          </FormRow>
          <Field label={t('Impact')} htmlFor="risk-impact">
            <Textarea
              id="risk-impact"
              value={form.impact}
              onChange={(event) => setForm((prev) => ({ ...prev, impact: event.target.value }))}
              placeholder={t('Who and what is affected, and how?')}
              style={{ minHeight: 68 }}
            />
          </Field>
          <Field label={t('Mitigation')} htmlFor="risk-mitigation">
            <Textarea
              id="risk-mitigation"
              value={form.mitigation}
              onChange={(event) => setForm((prev) => ({ ...prev, mitigation: event.target.value }))}
              placeholder={t('Workaround, permanent fix, or escalation.')}
              style={{ minHeight: 68 }}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

function RiskRow({
  risk,
  focused,
  onOpen,
  onItem,
}: {
  risk: Risk;
  focused: boolean;
  onOpen: () => void;
  onItem: (itemId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <tr
      id={`risk-${risk.id}`}
      className="row-interactive"
      tabIndex={0}
      style={focused ? { background: 'var(--surface-hover)' } : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
      }}
    >
      <td className="cell-code">{risk.code}</td>
      <td>
        <div className="risk-title">{risk.title}</div>
        <div className="risk-sub">
          {risk.items.length ? (
            risk.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="chip chip-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onItem(item.id);
                }}
              >
                {item.code}
              </button>
            ))
          ) : (
            <span>{t('No linked items')}</span>
          )}
          {risk.exceptionNote ? (
            <StatusTag tone="amber">{t('Exception approved')}</StatusTag>
          ) : null}
        </div>
      </td>
      <td>
        <StatusTag tone={riskSeverityTone(risk.severity)}>
          {t(RISK_SEVERITY_LABELS[risk.severity])}
        </StatusTag>
      </td>
      <td>
        <StatusTag tone={riskStatusTone(risk.status)}>
          {t(RISK_STATUS_LABELS[risk.status])}
        </StatusTag>
      </td>
      <td>{risk.owner.name}</td>
      <td>
        <div className="due-cell">
          <span>{formatDate(risk.dueDate, true)}</span>
          <span className="due-caption">{dueLabel(risk.dueDate)}</span>
        </div>
      </td>
      <td>
        <span className="faint small">{risk.items.length ? `${risk.items.length}` : '—'}</span>
      </td>
    </tr>
  );
}

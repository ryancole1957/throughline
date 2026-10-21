import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConclusionDecision, Condition, SignoffDecision } from '@throughline/shared';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import {
  Avatar,
  Button,
  ErrorState,
  Field,
  LoadingState,
  Select,
  StatusTag,
  Textarea,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn, daysUntil, formatDate, formatDateTime, percent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import {
  CONCLUSION_LABELS,
  CONDITION_SEVERITY_LABELS,
  CONDITION_STATUS_LABELS,
  PROJECT_STAGE_LABELS,
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
  ROLE_LABELS,
  SIGNOFF_DECISION_LABELS,
  acceptanceTone,
  conditionSeverityTone,
  conditionStatusTone,
  riskSeverityTone,
  riskStatusTone,
  signoffDecisionTone,
} from '../lib/labels';
import { useToast } from '../lib/toast';
import { useProject } from './ProjectShell';

export function ReportPage() {
  const project = useProject();
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [conclusionDecision, setConclusionDecision] = useState<ConclusionDecision | ''>('');
  const [conclusionNote, setConclusionNote] = useState('');
  const [conclusionBusy, setConclusionBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [signoffOpen, setSignoffOpen] = useState(false);
  const [signoffDecision, setSignoffDecision] = useState<SignoffDecision>('agree');
  const [signoffNote, setSignoffNote] = useState('');
  const [signoffBusy, setSignoffBusy] = useState(false);
  const [closingCondition, setClosingCondition] = useState<Condition | null>(null);
  const [conditionBusy, setConditionBusy] = useState(false);

  const reportQuery = useQuery({
    queryKey: ['report', project.id],
    queryFn: () => api.report.get(project.id),
  });

  if (reportQuery.isPending) {
    return (
      <div className="panel">
        <LoadingState label={t('Generating report…')} />
      </div>
    );
  }
  if (reportQuery.isError || !reportQuery.data) {
    return (
      <ErrorState
        title={t('Unable to generate report')}
        message={describeError(reportQuery.error)}
        onRetry={() => void reportQuery.refetch()}
      />
    );
  }

  const report = reportQuery.data;
  const projectDetail = report.project;
  const totals = report.totals;
  const e2ePercent = percent(report.e2e.passed, report.e2e.total);
  const canConclude =
    projectDetail.permissions.conclude &&
    projectDetail.status === 'active' &&
    projectDetail.stage !== 'closed' &&
    !report.conclusion;
  const ownSignoff = report.signoffs.find((entry) => entry.member?.id === user?.id);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['report', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
  }

  async function exportMarkdown() {
    setExporting(true);
    try {
      await api.report.download(projectDetail.id, projectDetail.code);
      toast.success(t('Report exported'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setExporting(false);
    }
  }

  async function saveConclusion() {
    if (!conclusionDecision) {
      toast.warning(t('Select a conclusion.'));
      return;
    }
    if (conclusionDecision !== 'accepted' && !conclusionNote.trim()) {
      toast.warning(t('A note is required unless the conclusion is accepted.'));
      return;
    }
    setConclusionBusy(true);
    try {
      const next = await api.report.conclude(projectDetail.id, {
        decision: conclusionDecision,
        note: conclusionNote.trim(),
      });
      queryClient.setQueryData(['report', project.id], next);
      setConclusionNote('');
      setConclusionDecision('');
      invalidate();
      toast.success(t('Conclusion recorded. Project moves to risks and sign-off.'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setConclusionBusy(false);
    }
  }

  async function saveSignoff() {
    if (signoffDecision !== 'agree' && !signoffNote.trim()) {
      toast.warning(t('A note is required for reservations or disagreement.'));
      return;
    }
    setSignoffBusy(true);
    try {
      const next = await api.report.sign(projectDetail.id, {
        decision: signoffDecision,
        note: signoffNote.trim(),
      });
      queryClient.setQueryData(['report', project.id], next);
      setSignoffOpen(false);
      setSignoffNote('');
      setSignoffDecision('agree');
      invalidate();
      toast.success(
        next.project.stage === 'closed'
          ? t('Sign-off complete. Project closed.')
          : t('Sign-off recorded'),
      );
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setSignoffBusy(false);
    }
  }

  async function closeCondition() {
    if (!closingCondition) return;
    setConditionBusy(true);
    try {
      await api.items.closeCondition(closingCondition.id);
      setClosingCondition(null);
      invalidate();
      toast.success(t('Condition closed'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setConditionBusy(false);
    }
  }

  return (
    <div>
      <div className="report-page">
        <div className="report-header">
          <div>
            <div className="eyebrow">{t('DELIVERY REPORT')}</div>
            <h1 className="report-title">
              {t('Delivery report · {{name}}', { name: projectDetail.name })}
            </h1>
            <div className="report-subtitle">
              {t('ID {{code}} · Client {{client}} · Stage {{stage}} · Generated {{generated}}', {
                code: projectDetail.code,
                client: projectDetail.client || '—',
                stage: t(PROJECT_STAGE_LABELS[projectDetail.stage]),
                generated: formatDateTime(report.generatedAt),
              })}
            </div>
          </div>
          <div className="report-actions no-print">
            <Button iconLeft="download" onClick={() => void exportMarkdown()} loading={exporting}>
              {t('Export Markdown')}
            </Button>
            <Button
              variant="primary"
              iconLeft="print"
              onClick={() => {
                toast.info(t('Opening print dialog. Save as PDF from the preview.'));
                setTimeout(() => window.print(), 300);
              }}
            >
              {t('Print / Save as PDF')}
            </Button>
          </div>
        </div>

        {report.conclusion ? (
          <div
            className={cn(
              'report-conclusion',
              report.conclusion.decision === 'accepted' && 'is-accepted',
              report.conclusion.decision === 'not_accepted' && 'is-rejected',
            )}
          >
            <Icon
              name={report.conclusion.decision === 'not_accepted' ? 'alert' : 'checkCircle'}
              size={16}
            />
            <div>
              <strong>
                {t('Conclusion: {{decision}}', {
                  decision: t(CONCLUSION_LABELS[report.conclusion.decision]),
                })}
              </strong>
              <div style={{ marginTop: 2 }}>{report.conclusion.note || t('No note.')}</div>
              <div className="report-conclusion-meta">
                {report.conclusion.decidedBy.name} · {formatDateTime(report.conclusion.decidedAt)}
              </div>
            </div>
          </div>
        ) : canConclude ? (
          <div className="report-conclusion-form no-print">
            <div className="form-section-title">{t('Record conclusion (Acceptance owner)')}</div>
            <div style={{ margin: '9px 0' }}>
              {(Object.keys(CONCLUSION_LABELS) as ConclusionDecision[]).map((decision) => (
                <label className="radio-row" key={decision}>
                  <input
                    type="radio"
                    name="conclusion"
                    value={decision}
                    checked={conclusionDecision === decision}
                    onChange={() => setConclusionDecision(decision)}
                  />
                  {t(CONCLUSION_LABELS[decision])}
                </label>
              ))}
            </div>
            <Textarea
              value={conclusionNote}
              onChange={(event) => setConclusionNote(event.target.value)}
              placeholder={t(
                'Conclusion note. List conditions and due dates when the decision is conditional.',
              )}
              style={{ minHeight: 76 }}
              aria-label={t('Conclusion note')}
            />
            <div className="form-actions" style={{ marginTop: 10 }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void saveConclusion()}
                loading={conclusionBusy}
              >
                {t('Confirm conclusion')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="notice notice-neutral no-print">
            <Icon name="info" size={14} />
            <span>{t('The acceptance owner records the conclusion after verification.')}</span>
          </div>
        )}

        <section className="report-section">
          <div className="report-section-head">
            <h2>{t('1. Completion snapshot')}</h2>
          </div>
          <div className="panel report-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Module')}</th>
                  <th style={{ width: 70 }}>{t('Items')}</th>
                  <th style={{ width: 100 }}>{t('Submitted')}</th>
                  <th style={{ width: 100 }}>{t('Accepted')}</th>
                  <th style={{ width: 80 }}>{t('High risks')}</th>
                </tr>
              </thead>
              <tbody>
                {report.moduleTable.map((module) => (
                  <tr key={module.module}>
                    <td className="module-name">{module.module}</td>
                    <td className="num">{module.total}</td>
                    <td className="num">{module.submitted}</td>
                    <td className="num" style={{ color: 'var(--ok)' }}>
                      {module.settled}
                    </td>
                    <td className="num">
                      {module.highRisks ? (
                        <span className="risk-count">{module.highRisks}</span>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-sunken)' }}>
                  <td>
                    <strong>{t('Total')}</strong>
                  </td>
                  <td className="num">{totals.items}</td>
                  <td className="num">{totals.submitted}</td>
                  <td className="num" style={{ color: 'var(--ok)' }}>
                    {totals.settled}
                  </td>
                  <td className="num">{totals.highRisks}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <h2>{t('2. Differences')}</h2>
          </div>
          <div className="panel report-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 68 }}>{t('ID')}</th>
                  <th>{t('Item')}</th>
                  <th style={{ width: 90 }}>{t('Outcome')}</th>
                  <th>{t('Reason')}</th>
                  <th style={{ width: 190 }}>{t('Source')}</th>
                </tr>
              </thead>
              <tbody>
                {report.differences.length ? (
                  report.differences.map((difference) => (
                    <tr key={difference.item.id}>
                      <td className="cell-code">{difference.item.code}</td>
                      <td>{difference.item.title}</td>
                      <td>
                        <StatusTag tone={acceptanceTone(difference.acceptanceStatus)}>
                          {t(
                            difference.acceptanceStatus === 'conditional'
                              ? 'Conditional'
                              : difference.acceptanceStatus === 'rejected'
                                ? 'Rejected'
                                : 'N/A',
                          )}
                        </StatusTag>
                      </td>
                      <td className="muted">
                        {difference.reason || '—'}
                        <div className="done-sub">
                          {difference.decidedBy} · {formatDate(difference.decidedAt)}
                        </div>
                      </td>
                      <td className="source-cell">
                        {difference.environment || difference.version
                          ? `${difference.environment || '—'} · ${difference.version || '—'}`
                          : t('Source pending')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="report-empty">
                      {t('No differences.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <h2>{t('3. Open conditions')}</h2>
          </div>
          <div className="panel report-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 62 }}>{t('ID')}</th>
                  <th>{t('Condition')}</th>
                  <th style={{ width: 82 }}>{t('Source')}</th>
                  <th style={{ width: 76 }}>{t('Owner')}</th>
                  <th style={{ width: 86 }}>{t('Due')}</th>
                  <th style={{ width: 60 }}>{t('Severity')}</th>
                  <th style={{ width: 76 }}>{t('Status')}</th>
                  <th style={{ width: 88 }} className="no-print" />
                </tr>
              </thead>
              <tbody>
                {report.conditions.length ? (
                  report.conditions.map((condition) => {
                    const canClose =
                      condition.status === 'open' &&
                      (condition.owner.id === user?.id || projectDetail.permissions.manageProject);
                    return (
                      <tr key={condition.id}>
                        <td className="cell-code">{condition.code}</td>
                        <td>{condition.description}</td>
                        <td>
                          <button
                            type="button"
                            className="text-link mono"
                            onClick={() =>
                              navigate(
                                `/projects/${projectDetail.id}/items?focus=${condition.item.id}`,
                              )
                            }
                          >
                            {condition.item.code}
                          </button>
                        </td>
                        <td>{condition.owner.name}</td>
                        <td
                          className={daysUntil(condition.dueDate) === 0 ? 'warn-text' : ''}
                        >
                          {formatDate(condition.dueDate)}
                        </td>
                        <td>
                          <StatusTag tone={conditionSeverityTone(condition.severity)}>
                            {t(CONDITION_SEVERITY_LABELS[condition.severity])}
                          </StatusTag>
                        </td>
                        <td>
                          <StatusTag tone={conditionStatusTone(condition.status)}>
                            {t(CONDITION_STATUS_LABELS[condition.status])}
                          </StatusTag>
                        </td>
                        <td className="no-print" style={{ textAlign: 'right' }}>
                          {canClose ? (
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => setClosingCondition(condition)}
                            >
                              {t('Close condition')}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="report-empty">
                      {t('No open conditions.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <h2>{t('4. Open risks')}</h2>
          </div>
          <div className="panel report-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 62 }}>{t('ID')}</th>
                  <th style={{ width: 56 }}>{t('Severity')}</th>
                  <th>{t('Risk')}</th>
                  <th style={{ width: 76 }}>{t('Owner')}</th>
                  <th style={{ width: 86 }}>{t('Due')}</th>
                  <th style={{ width: 116 }}>{t('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {report.openRisks.length ? (
                  report.openRisks.map((risk) => {
                    const statusLabel =
                      risk.status === 'escalated'
                        ? t('Escalated · awaiting decision')
                        : t(RISK_STATUS_LABELS[risk.status]);
                    return (
                      <tr key={risk.id}>
                        <td className="cell-code">{risk.code}</td>
                        <td>
                          <StatusTag tone={riskSeverityTone(risk.severity)}>
                            {t(RISK_SEVERITY_LABELS[risk.severity])}
                          </StatusTag>
                        </td>
                        <td>
                          {risk.title}
                          {risk.exceptionNote ? (
                            <StatusTag tone="amber">{t('Exception approved')}</StatusTag>
                          ) : null}
                        </td>
                        <td>{risk.owner.name}</td>
                        <td>{formatDate(risk.dueDate)}</td>
                        <td>
                          <StatusTag tone={riskStatusTone(risk.status)}>{statusLabel}</StatusTag>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="report-empty">
                      {t('No open risks.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <h2>{t('5. Out of scope')}</h2>
          </div>
          <div className="report-scope">{report.scope || '—'}</div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <h2>{t('6. End-to-end verification')}</h2>
            <span>{t('Authorized staging environment only')}</span>
          </div>
          <div className="panel">
            <div className="report-e2e">
              <div className="report-e2e-copy">
                <strong>
                  {t('Verified {{passed}} of {{total}} steps', {
                    passed: report.e2e.passed,
                    total: report.e2e.total,
                  })}
                </strong>
                <span>
                  {report.e2e.passed === report.e2e.total
                    ? t('All end-to-end scripts passed.')
                    : t('Unverified steps should be tracked as conditions.')}
                </span>
              </div>
              <div className="report-e2e-bar">
                <div className="progress-track">
                  <span
                    className="progress-fill progress-fill-supply"
                    style={{ width: `${e2ePercent}%` }}
                  />
                </div>
                <span className="faint">{e2ePercent}%</span>
              </div>
            </div>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <h2>{t('7. Sign-off')}</h2>
          </div>
          <div className="hint" style={{ marginBottom: 9 }}>
            {t('Current snapshot')} <span className="mono">{report.currentSnapshotHash}</span>
            {t('. Sign-off snapshots become stale if scope, conditions, or conclusion change.')}
          </div>
          <div className="panel report-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>{t('Signatory')}</th>
                  <th style={{ width: 130 }}>{t('Role')}</th>
                  <th style={{ width: 100 }}>{t('Decision')}</th>
                  <th>{t('Note')}</th>
                  <th style={{ width: 110 }}>{t('Scope snapshot')}</th>
                  <th style={{ width: 130 }}>{t('Time')}</th>
                  <th style={{ width: 90 }} className="no-print" />
                </tr>
              </thead>
              <tbody>
                {report.signoffs.map((signoff) => (
                  <tr key={signoff.role}>
                    <td>
                      {signoff.member ? (
                        <span className="signoff-role">
                          <Avatar name={signoff.member.name} size={24} />
                          <span className="signoff-role-copy">
                            <span className="signoff-role-name">{signoff.member.name}</span>
                            <span className="signoff-role-title">
                              {signoff.member.title || t('Project member')}
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="muted">{t('Unassigned')}</span>
                      )}
                    </td>
                    <td className="muted">{t(ROLE_LABELS[signoff.role])}</td>
                    <td>
                      {signoff.decision ? (
                        <StatusTag tone={signoffDecisionTone(signoff.decision)}>
                          {t(SIGNOFF_DECISION_LABELS[signoff.decision])}
                        </StatusTag>
                      ) : (
                        <span className="tag tag-gray">{t('Not signed')}</span>
                      )}
                    </td>
                    <td className="muted">{signoff.note || (signoff.decision ? '—' : '')}</td>
                    <td className="signoff-hash">
                      {signoff.snapshotHash ?? '—'}
                      {signoff.hashState ? (
                        <span
                          className={cn(
                            'signoff-hash-state',
                            signoff.hashState === 'current' ? 'is-current' : 'is-stale',
                          )}
                        >
                          {signoff.hashState === 'current'
                            ? t('Matches current')
                            : t('Snapshot changed')}
                        </span>
                      ) : null}
                    </td>
                    <td className="muted">
                      {signoff.signedAt ? formatDateTime(signoff.signedAt) : '—'}
                    </td>
                    <td className="no-print" style={{ textAlign: 'right' }}>
                      {signoff.member?.id === user?.id && !signoff.decision && report.canSignOff ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setSignoffOpen(true);
                            setSignoffDecision('agree');
                            setSignoffNote('');
                          }}
                        >
                          {t('Sign')}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ownSignoff?.decision ? (
            <div className="hint" style={{ marginTop: 8 }}>
              {t('You signed: {{decision}}', {
                decision: t(SIGNOFF_DECISION_LABELS[ownSignoff.decision]),
              })}
            </div>
          ) : null}
        </section>
      </div>

      <Dialog
        open={signoffOpen}
        onClose={() => setSignoffOpen(false)}
        title={t('Sign delivery report')}
        description={t('Confirms the delivery scope and open items in the current snapshot.')}
        size="md"
        footer={
          <>
            <Button onClick={() => setSignoffOpen(false)}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={() => void saveSignoff()} loading={signoffBusy}>
              {t('Confirm sign-off')}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="notice notice-neutral">
            <Icon name="shield" size={14} />
            <span>
              {t('Snapshot')} <span className="mono">{report.currentSnapshotHash}</span>
              {t('. A note is required for reservations or disagreement.')}
            </span>
          </div>
          <Field label={t('Decision')} htmlFor="signoff-decision" required>
            <Select
              id="signoff-decision"
              value={signoffDecision}
              onChange={(event) => setSignoffDecision(event.target.value as SignoffDecision)}
            >
              {Object.entries(SIGNOFF_DECISION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Note')} htmlFor="signoff-note">
            <Textarea
              id="signoff-note"
              value={signoffNote}
              onChange={(event) => setSignoffNote(event.target.value)}
              placeholder={t('Reservations, conditions, or additional notes.')}
              style={{ minHeight: 76 }}
            />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(closingCondition)}
        onClose={() => setClosingCondition(null)}
        onConfirm={() => void closeCondition()}
        title={t('Close condition')}
        description={t('Marks the condition closed and updates the report snapshot.')}
        confirmLabel={t('Close condition')}
        busy={conditionBusy}
      >
        {closingCondition ? (
          <div className="condition-card" style={{ marginBottom: 0 }}>
            <div className="condition-head">
              <span className="mono">{closingCondition.code}</span>
              <StatusTag tone={conditionSeverityTone(closingCondition.severity)}>
                {t(CONDITION_SEVERITY_LABELS[closingCondition.severity])}
              </StatusTag>
            </div>
            <div className="condition-body">{closingCondition.description}</div>
            <div className="condition-meta">
              <span>{t('Owner {{name}}', { name: closingCondition.owner.name })}</span>
              <span>{t('Due {{date}}', { date: formatDate(closingCondition.dueDate) })}</span>
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

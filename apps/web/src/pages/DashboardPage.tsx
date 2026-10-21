import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Todo, TodoKind } from '@throughline/shared';

import { StageStepper } from '../components/Stepper';
import {
  DualProgress,
  ErrorState,
  LoadingState,
  StatusTag,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { cn, formatDate, formatDateTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import {
  PROJECT_STAGE_LABELS,
  ROLE_LABELS,
  TODO_KIND_LABELS,
  riskSeverityTone,
  type TagTone,
} from '../lib/labels';
import { useProject } from './ProjectShell';

const TODO_TONE: Record<TodoKind, TagTone> = {
  submit_evidence: 'amber',
  supplement: 'amber',
  core_review: 'blue',
  business_review: 'blue',
  acceptance: 'blue',
  answer_question: 'amber',
  condition: 'amber',
  risk_owner: 'amber',
  risk_decision: 'red',
  asset_verification: 'amber',
  asset_rotation: 'amber',
  signoff: 'blue',
  conclusion: 'blue',
};

function tabForTodo(kind: TodoKind): string {
  if (kind === 'submit_evidence' || kind === 'supplement') return 'evidence';
  if (kind === 'answer_question') return 'notes';
  return 'review';
}

export function DashboardPage() {
  const { t } = useI18n();
  const project = useProject();
  const navigate = useNavigate();
  const overviewQuery = useQuery({
    queryKey: ['overview', project.id],
    queryFn: () => api.projects.overview(project.id),
  });

  if (overviewQuery.isPending) {
    return (
      <div className="panel">
        <LoadingState label={t('Loading project overview…')} />
      </div>
    );
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <ErrorState
        title={t('Could not load overview')}
        message={describeError(overviewQuery.error)}
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  const overview = overviewQuery.data;
  const stats = overview.stats;
  const roleText = project.myRole
    ? t(ROLE_LABELS[project.myRole])
    : project.isAdmin
      ? t('System admin')
      : t('Team member');
  const isPaused = project.status === 'paused';
  const isClosed = project.stage === 'closed';

  function openTodo(todo: Todo) {
    if (todo.kind === 'signoff' || todo.kind === 'conclusion') {
      navigate(`/projects/${project.id}/report`);
      return;
    }
    if (todo.riskId) {
      navigate(`/projects/${project.id}/risks?focus=${todo.riskId}`);
      return;
    }
    if (todo.assetId) {
      navigate(`/projects/${project.id}/assets?focus=${todo.assetId}`);
      return;
    }
    if (todo.itemId) {
      navigate(
        `/projects/${project.id}/items?focus=${todo.itemId}&tab=${tabForTodo(todo.kind)}`,
      );
    }
  }

  return (
    <div className="section-stack">
      <section className="project-banner" aria-labelledby="project-title">
        <div className="project-banner-top">
          <div className="project-banner-copy">
            <div className="eyebrow">{t(PROJECT_STAGE_LABELS[project.stage])}</div>
            <h1 className="project-banner-title" id="project-title">
              {project.name}
            </h1>
            <div className="project-banner-meta">
              <span className="mono">{project.code}</span>
              {project.client ? (
                <>
                  <span className="dot-separator" aria-hidden="true" />
                  <span>{project.client}</span>
                </>
              ) : null}
              <span className="dot-separator" aria-hidden="true" />
              <span>{t('Owner {{name}}', { name: project.createdBy.name })}</span>
              <span className="dot-separator" aria-hidden="true" />
              <span>{t('Due {{date}}', { date: formatDate(project.deadline) })}</span>
            </div>
          </div>
          <div className="project-banner-side">
            <div className="banner-metric">
              <div className="banner-metric-label">{t('Submitted')}</div>
              <div className="banner-metric-value">
                {stats.submittedItems}
                <span>/ {stats.totalItems}</span>
              </div>
            </div>
            <div className="banner-metric">
              <div className="banner-metric-label">{t('Accepted')}</div>
              <div className="banner-metric-value is-ok">
                {stats.settledItems}
                <span>/ {stats.totalItems}</span>
              </div>
            </div>
            <div className="banner-metric">
              <div className="banner-metric-label">{t('High risks')}</div>
              <div
                className={cn(
                  'banner-metric-value',
                  stats.highRisks ? 'is-risk' : '',
                )}
              >
                {stats.highRisks}
              </div>
            </div>
            <div className="banner-metric">
              <div className="banner-metric-label">{t('Open conditions')}</div>
              <div className="banner-metric-value">{stats.openConditions}</div>
            </div>
            <div className="banner-progress">
              <DualProgress
                supply={stats.submittedItems}
                accepted={stats.settledItems}
                total={stats.totalItems}
              />
              <div className="banner-progress-caption">
                <span>{t('Submitted')}</span>
                <span>{t('Accepted')}</span>
              </div>
            </div>
          </div>
        </div>
        <StageStepper
          stage={project.stage}
          status={project.status}
          milestones={project.milestones}
        />
      </section>

      <section className="panel script-panel">
        <div className="panel-header">
          <span className="panel-title">{t('Verification script')}</span>
          <div className="panel-actions">
            <StatusTag tone={stats.e2ePassed === stats.e2eTotal ? 'green' : 'blue'}>
              {t('{{passed}} / {{total}} verified', {
                passed: stats.e2ePassed,
                total: stats.e2eTotal,
              })}
            </StatusTag>
            <button
              type="button"
              className="text-link"
              onClick={() => navigate(`/projects/${project.id}/verification`)}
            >
              {t('View script')}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="script-strip">
            {overview.steps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={cn('script-chip', `is-${step.status}`)}
                onClick={() =>
                  navigate(`/projects/${project.id}/verification?focus=${step.id}`)
                }
              >
                <span className="script-index">{step.position}</span>
                <span>{step.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-column">
          <section className="panel module-table">
            <div className="panel-header">
              <span className="panel-title">{t('Module progress')}</span>
              <div className="panel-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => navigate(`/projects/${project.id}/items`)}
                >
                  {t('View items')}
                </button>
              </div>
            </div>
            <div className="panel-body-flush table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('Module')}</th>
                    <th style={{ width: 58 }}>{t('Items')}</th>
                    <th style={{ width: 130 }}>{t('Submitted / Accepted')}</th>
                    <th style={{ width: 144 }}>{t('Progress')}</th>
                    <th style={{ width: 64 }}>{t('High risks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.modules.map((module) => (
                    <tr
                      key={module.module}
                      className="row-interactive"
                      tabIndex={0}
                      onClick={() =>
                        navigate(
                          `/projects/${project.id}/items?module=${encodeURIComponent(module.module)}`,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          navigate(
                            `/projects/${project.id}/items?module=${encodeURIComponent(module.module)}`,
                          );
                        }
                      }}
                    >
                      <td>
                        <span className="module-name">{module.module}</span>
                      </td>
                      <td className="num module-count">{module.total}</td>
                      <td>
                        <span className="module-stat-line">
                          <span className="supply">{module.submitted}</span>
                          <span aria-hidden="true" className="faint">
                            /
                          </span>
                          <span className="accepted">{module.settled}</span>
                        </span>
                      </td>
                      <td>
                        <div className="module-progress">
                          <DualProgress
                            supply={module.submitted}
                            accepted={module.settled}
                            total={module.total}
                            compact
                          />
                        </div>
                      </td>
                      <td>
                        {module.highRisks ? (
                          <StatusTag tone="red">
                            {t('{{count}} open', { count: module.highRisks })}
                          </StatusTag>
                        ) : (
                          <span className="module-risk-empty">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('Responsibility gaps')}</span>
            </div>
            <div className="gap-grid">
              <GapCell
                title={t('Submissions · Delivery')}
                count={overview.gaps.delivery.count}
                items={overview.gaps.delivery.items}
                emptyText={t('All evidence submitted')}
                onOpen={() => navigate(`/projects/${project.id}/items`)}
              />
              <GapCell
                title={t('Reviews · Technical / business')}
                count={overview.gaps.review.count}
                items={overview.gaps.review.items}
                emptyText={t('All reviews complete')}
                onOpen={() => navigate(`/projects/${project.id}/items`)}
              />
              <GapCell
                title={t('Acceptance · Owner')}
                count={overview.gaps.acceptance.count}
                items={overview.gaps.acceptance.items}
                emptyText={t('All items accepted')}
                onOpen={() => navigate(`/projects/${project.id}/items`)}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('Recent activity')}</span>
            </div>
            <div className="activity-list">
              {overview.recentEvents.length ? (
                overview.recentEvents.map((event) => (
                  <div className="activity-row" key={event.id}>
                    <span className="activity-time">{formatDateTime(event.createdAt)}</span>
                    <span className="activity-actor">{event.actor.name}</span>
                    <span className="activity-text">
                      {event.item ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/projects/${project.id}/items?focus=${event.item?.id}&tab=log`,
                            )
                          }
                        >
                          {event.item.code}
                        </button>
                      ) : null}
                      {event.item ? ' ' : ''}
                      {event.detail}
                    </span>
                  </div>
                ))
              ) : (
                <div className="inline-empty">{t('No activity yet.')}</div>
              )}
            </div>
          </section>
        </div>

        <div className="dashboard-column">
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('My tasks')}</span>
              <span className="panel-description">
                {t('Role: {{role}}', { role: roleText })}
              </span>
              <div className="panel-actions">
                <span className="todo-count">{overview.todos.length}</span>
              </div>
            </div>
            <div className={cn('todo-list', 'panel-scroll')}>
              {isPaused || isClosed ? (
                <div className="inline-empty">
                  {isClosed
                    ? t('Project closed; no open tasks.')
                    : t('Project paused; tasks will return when resumed.')}
                </div>
              ) : overview.todos.length ? (
                overview.todos.map((todo) => (
                  <button
                    key={todo.id}
                    type="button"
                    className="todo-row"
                    onClick={() => openTodo(todo)}
                  >
                    <StatusTag tone={TODO_TONE[todo.kind]}>
                      {t(TODO_KIND_LABELS[todo.kind])}
                    </StatusTag>
                    <span className="todo-copy">
                      <span className="todo-title">{todo.title}</span>
                      <span className="todo-meta">{todo.meta}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="inline-empty">
                  {project.isAdmin && !project.myRole
                    ? t('No project tasks for admins.')
                    : t('No tasks for your role.')}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('High risks & decisions')}</span>
              <div className="panel-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => navigate(`/projects/${project.id}/risks`)}
                >
                  {t('Risk register')}
                </button>
              </div>
            </div>
            <div className={cn('panel-scroll', 'panel-scroll-bordered')}>
              {overview.highRisks.length ? (
                overview.highRisks.map((risk) => (
                  <button
                    key={risk.id}
                    type="button"
                    className="mini-risk"
                    onClick={() =>
                      navigate(`/projects/${project.id}/risks?focus=${risk.id}`)
                    }
                  >
                    <StatusTag tone={riskSeverityTone(risk.severity)}>
                      {t(
                        risk.severity === 'high'
                          ? 'High'
                          : risk.severity === 'medium'
                            ? 'Medium'
                            : 'Low',
                      )}
                    </StatusTag>
                    <span className="mini-risk-copy">
                      <span className="mini-risk-title">{risk.title}</span>
                      <span className="mini-risk-meta">
                        {risk.code} · {risk.owner.name} · {formatDate(risk.dueDate, true)} ·{' '}
                        {t(
                          risk.status === 'escalated'
                            ? 'Escalated · awaiting decision'
                            : risk.status === 'in_progress'
                              ? 'In progress'
                              : 'Open',
                        )}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="inline-empty">{t('No open high risks.')}</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function GapCell({
  title,
  count,
  items,
  emptyText,
  onOpen,
}: {
  title: string;
  count: number;
  items: Array<{ id: string; code: string; title: string }>;
  emptyText: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const project = useProject();
  return (
    <div className="gap-cell">
      <div className="gap-heading" title={title}>
        {title}
      </div>
      <div className={cn('gap-value', count === 0 && 'is-zero')}>{count}</div>
      {items.length ? (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="gap-sample"
            title={item.title}
            style={{ display: 'block', textAlign: 'left', width: '100%' }}
            onClick={() => navigate(`/projects/${project.id}/items?focus=${item.id}`)}
          >
            {item.code} {item.title}
          </button>
        ))
      ) : (
        <div className="gap-sample" style={{ color: 'var(--ok)' }}>
          {emptyText}
        </div>
      )}
      <button type="button" className="gap-link text-link" onClick={onOpen}>
        {t('View items')}
      </button>
    </div>
  );
}

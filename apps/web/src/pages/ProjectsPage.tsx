import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectSummary } from '@throughline/shared';

import { CreateProjectDialog } from '../components/CreateProjectDialog';
import { GlobalHeader } from '../components/GlobalHeader';
import {
  Button,
  DualProgress,
  EmptyState,
  ErrorState,
  LoadingState,
  MetaItem,
  PageHeader,
  StatusTag,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn, dueLabel, dueTone, formatDate } from '../lib/format';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { PROJECT_STAGE_LABELS, ROLE_LABELS, stageTone } from '../lib/labels';

export function ProjectsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  });
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: api.teams.list });

  const projects = projectsQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const activeProjects = projects.filter((project) => project.stage !== 'closed').length;
  const highRisks = projects.reduce((sum, project) => sum + project.stats.highRisks, 0);
  const openConditions = projects.reduce(
    (sum, project) => sum + project.stats.openConditions,
    0,
  );

  return (
    <div className="global-page">
      <GlobalHeader />
      <main className="global-content">
        <PageHeader
          eyebrow={t('WORKSPACE')}
          title={t('Projects')}
          meta={
            <>
              <MetaItem icon="layers">
                {t('{{count}} projects', { count: projects.length })}
              </MetaItem>
              <MetaItem icon="clock">
                {t('{{count}} active', { count: activeProjects })}
              </MetaItem>
              <MetaItem icon="alert">
                {t('{{count}} high risks', { count: highRisks })}
              </MetaItem>
              <MetaItem icon="flag">
                {t('{{count}} open conditions', { count: openConditions })}
              </MetaItem>
              {user?.systemRole === 'admin' ? (
                <StatusTag tone="slate">{t('Admin view')}</StatusTag>
              ) : null}
            </>
          }
          actions={
            <Button
              variant="primary"
              iconLeft="plus"
              onClick={() => (teams.length ? setCreateOpen(true) : navigate('/teams'))}
            >
              {teams.length ? t('New project') : t('Create a team')}
            </Button>
          }
        />

        {projectsQuery.isPending ? (
          <div className="panel">
            <LoadingState label={t('Loading projects…')} />
          </div>
        ) : projectsQuery.isError ? (
          <ErrorState
            message={describeError(projectsQuery.error)}
            onRetry={() => void projectsQuery.refetch()}
          />
        ) : projects.length === 0 ? (
          <div className="project-empty">
            <EmptyState
              icon="layers"
              title={t('No projects yet')}
              description={
                teams.length
                  ? t('Create a project and invite the delivery team, reviewers, and acceptance owner.')
                  : t('Create or join a team before starting a project.')
              }
              action={
                <Button
                  variant="primary"
                  iconLeft="plus"
                  onClick={() => (teams.length ? setCreateOpen(true) : navigate('/teams'))}
                >
                  {teams.length ? t('Create project') : t('Go to teams')}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="panel project-table-wrapper">
            <table className="data-table project-table">
              <thead>
                <tr>
                  <th>{t('Project')}</th>
                  <th style={{ width: 140 }}>{t('Team')}</th>
                  <th style={{ width: 128 }}>{t('Stage')}</th>
                  <th style={{ width: 104 }}>{t('Deadline')}</th>
                  <th style={{ width: 198 }}>{t('Submitted / Accepted')}</th>
                  <th style={{ width: 90 }}>{t('High risks')}</th>
                  <th style={{ width: 140 }}>{t('My role')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onOpen={() => navigate(`/projects/${project.id}/dashboard`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {createOpen ? (
        <CreateProjectDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          teams={teams}
          onCreated={(project) => {
            setCreateOpen(false);
            navigate(`/projects/${project.id}/dashboard`);
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectRow({
  project,
  onOpen,
}: {
  project: ProjectSummary;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const closed = project.stage === 'closed';
  const role = project.myRole
    ? t(ROLE_LABELS[project.myRole])
    : project.isAdmin
      ? t('System admin')
      : t('Team member');
  return (
    <tr
      className="row-interactive"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-label={t('Open project {{name}}', { name: project.name })}
    >
      <td>
        <div className="project-name">{project.name}</div>
        <div className="project-sub">
          <span className="mono">{project.code}</span>
          {project.client ? (
            <>
              <span className="dot-separator" />
              <span>{project.client}</span>
            </>
          ) : null}
          {project.isAdmin && !project.myRole ? (
            <>
              <span className="dot-separator" />
              <span>{t('All projects')}</span>
            </>
          ) : null}
        </div>
      </td>
      <td>
        <span className="role-marker">
          <Icon name="users" size={12} />
          {project.teamName}
        </span>
      </td>
      <td>
        <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
          <StatusTag tone={stageTone(project.stage)}>
            {t(PROJECT_STAGE_LABELS[project.stage])}
          </StatusTag>
          {project.status === 'paused' ? (
            <StatusTag tone="amber">{t('Paused')}</StatusTag>
          ) : null}
        </div>
      </td>
      <td>
        <div className={cn('due-cell', dueTone(project.deadline, closed))}>
          <span>{formatDate(project.deadline, true)}</span>
          <span className="due-caption">
            {closed ? t('Closed') : dueLabel(project.deadline)}
          </span>
        </div>
      </td>
      <td>
        <div className="project-progress">
          <DualProgress
            supply={project.stats.submittedItems}
            accepted={project.stats.settledItems}
            total={project.stats.totalItems}
            compact
          />
          <span className="project-progress-count">
            <strong>{project.stats.submittedItems}</strong> / {project.stats.totalItems}
            <br />
            <span style={{ color: 'var(--ok)' }}>
              {t('{{count}} accepted', { count: project.stats.settledItems })}
            </span>
          </span>
        </div>
      </td>
      <td>
        {project.stats.highRisks ? (
          <span className="risk-count">
            {t('{{count}} open', { count: project.stats.highRisks })}
          </span>
        ) : (
          <span className="faint">—</span>
        )}
      </td>
      <td>
        <span className="role-marker">
          {project.myRole ? <Icon name="user" size={12} /> : <Icon name="shield" size={12} />}
          {role}
        </span>
      </td>
    </tr>
  );
}


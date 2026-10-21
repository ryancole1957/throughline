import { useQuery } from '@tanstack/react-query';
import { Suspense, createContext, useContext, useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useParams,
} from 'react-router-dom';
import type { ProjectDetail } from '@throughline/shared';

import { BrandMark, Wordmark } from '../components/GlobalHeader';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { UserMenu } from '../components/UserMenu';
import { Button, IconButton, LoadingState, Spinner, StatusTag } from '../components/ui';
import { ApiError, api, describeError } from '../lib/api';
import { cn, formatDate, dueLabel } from '../lib/format';
import { getIntlLocale } from '../lib/locale';
import { useMediaQuery } from '../lib/hooks';
import { Icon, type IconName } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import {
  PROJECT_STAGE_LABELS,
  ROLE_LABELS,
  stageTone,
} from '../lib/labels';

const ProjectContext = createContext<ProjectDetail | null>(null);

export function useProject(): ProjectDetail {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('useProject must be used inside ProjectShell');
  return value;
}

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  {
    label: 'Execution',
    items: [
      { key: 'items', label: 'Work items', icon: 'list' },
      { key: 'verification', label: 'End-to-end verification', icon: 'clipboard' },
    ],
  },
  {
    label: 'Discovery',
    items: [
      { key: 'graph', label: 'Page & API map', icon: 'graph' },
      { key: 'assets', label: 'Asset inventory', icon: 'box' },
    ],
  },
  { label: 'Oversight', items: [{ key: 'risks', label: 'Risk register', icon: 'alert' }] },
  { label: 'Close-out', items: [{ key: 'report', label: 'Report & sign-off', icon: 'file' }] },
  { label: 'Management', items: [{ key: 'settings', label: 'Project settings', icon: 'settings' }] },
];

const TITLE_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  items: 'Work items',
  verification: 'End-to-end verification',
  graph: 'Page & API map',
  assets: 'Asset inventory',
  risks: 'Risk register',
  report: 'Report & sign-off',
  settings: 'Project settings',
};

function todayLabel(): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
}

export function ProjectShell() {
  const { t } = useI18n();
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 900px)');

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId ?? ''),
    enabled: Boolean(projectId),
    retry: (count, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return count < 1;
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  if (projectQuery.isPending) {
    return (
      <div className="standalone-center">
        <div className="row" style={{ gap: 10 }}>
          <Spinner size={18} />
          <span className="muted">{t('Loading project…')}</span>
        </div>
      </div>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    const error = projectQuery.error;
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="standalone-center">
        <div className="message-card">
          <BrandMark />
          <h1>
            {missing ? t('Project not found or access denied') : t('Could not load project')}
          </h1>
          <p>
            {missing
              ? t(
                  'This project may have been deleted, or your account does not have access. Ask the project owner to add you.',
                )
              : describeError(error)}
          </p>
          <div className="message-actions">
            <Link to="/teams" className="btn btn-primary">
              {t('Back to teams')}
            </Link>
            {!missing ? (
              <Button onClick={() => void projectQuery.refetch()}>{t('Try again')}</Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const project = projectQuery.data;
  const routeKey = location.pathname.split('/').at(-1) ?? 'dashboard';
  const title = t(TITLE_MAP[routeKey] ?? TITLE_MAP.dashboard!);
  const roleText = project.myRole
    ? t(ROLE_LABELS[project.myRole])
    : project.isAdmin
      ? t('System admin')
      : t('Team member');

  return (
    <ProjectContext.Provider value={project}>
      <div className="app-frame">
        {navOpen ? (
          <div
            className="sidebar-scrim"
            onMouseDown={() => setNavOpen(false)}
            aria-hidden="true"
          />
        ) : null}
        <aside
          className={cn('sidebar', navOpen && 'is-open')}
          aria-label={t('Project navigation')}
          aria-hidden={isMobile && !navOpen ? true : undefined}
          inert={isMobile && !navOpen ? true : undefined}
        >
          <Link
            to="/teams"
            className="sidebar-brand"
            aria-label={t('Back to teams')}
          >
            <BrandMark />
            <Wordmark />
          </Link>
          <Link to="/projects" className="project-switcher">
            <span className="project-switcher-top">
              <Icon name="layers" size={12} />
              <span className="project-switcher-code">{project.code}</span>
              <Icon name="chevronDown" size={12} />
            </span>
            <span className="project-switcher-name">{project.name}</span>
            <span className="project-switcher-team">{project.teamName}</span>
            <span className="project-switcher-meta">
              <StatusTag tone={stageTone(project.stage)}>
                {t(PROJECT_STAGE_LABELS[project.stage])}
              </StatusTag>
              {project.status === 'paused' ? (
                <StatusTag tone="amber">{t('Paused')}</StatusTag>
              ) : null}
            </span>
            <span className="project-switcher-deadline">
              {t('Due {{date}} · {{due}}', {
                date: formatDate(project.deadline),
                due: dueLabel(project.deadline),
              })}
            </span>
          </Link>
          <nav className="side-nav" aria-label={t('Project sections')}>
            {NAV_GROUPS.map((group) => (
              <div className="nav-group" key={group.label}>
                <div className="nav-group-label">{t(group.label)}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.key}
                    to={`/projects/${project.id}/${item.key}`}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) => cn('nav-link', isActive && 'is-active')}
                  >
                    <Icon name={item.icon} size={15} />
                    <span>{t(item.label)}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-version">
              <span>THROUGHLINE</span>
              <span>v{__APP_VERSION__}</span>
            </div>
          </div>
        </aside>

        <div className="main-column">
          <header className="topbar">
            <IconButton
              className="mobile-menu-button"
              icon="menu"
              label={t('Open navigation')}
              onClick={() => setNavOpen(true)}
            />
            <div className="topbar-copy">
              <h1>{title}</h1>
            </div>
            <div className="topbar-actions">
              <StatusTag tone={stageTone(project.stage)}>
                {t(PROJECT_STAGE_LABELS[project.stage])}
              </StatusTag>
              {project.status === 'paused' ? (
                <StatusTag tone="amber">{t('Paused')}</StatusTag>
              ) : null}
              <span className="topbar-date">
                <Icon name="calendar" size={12} />
                {todayLabel()}
              </span>
              <LanguageSwitch />
              <span className="topbar-divider" aria-hidden="true" />
              <UserMenu subtitle={roleText} />
            </div>
          </header>
          <main className="content" id="main-content">
            <div className="content-inner">
              <ProjectStateBanner project={project} />
              <Suspense
                fallback={
                  <div className="panel">
                    <LoadingState label={t('Loading view…')} />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </ProjectContext.Provider>
  );
}

function ProjectStateBanner({ project }: { project: ProjectDetail }) {
  const { t } = useI18n();
  if (project.status === 'paused') {
    return (
      <div className="project-state-banner">
        <Icon name="pause" size={14} />
        <span>
          <strong>{t('Project paused.')}</strong>{' '}
          {t(
            'Writes are locked. The project owner or an admin can resume it in Project settings.',
          )}
        </span>
      </div>
    );
  }
  if (project.stage === 'closed') {
    return (
      <div className="project-state-banner is-closed">
        <Icon name="lock" size={14} />
        <span>
          <strong>{t('Project closed.')}</strong>{' '}
          {t(
            'This record is read-only. The project owner or an admin can reopen it in Project settings.',
          )}
        </span>
      </div>
    );
  }
  return null;
}

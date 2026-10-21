import { NavLink, Link } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { cn } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import { LanguageSwitch } from './LanguageSwitch';
import { UserMenu } from './UserMenu';

export function BrandMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M6 4v16M6 12h7M13 4v16"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="19" cy="8" r="1.8" fill="#7b9ce8" />
        <circle cx="19" cy="16" r="1.8" fill="#7cc79a" />
      </svg>
    </span>
  );
}

export function Wordmark() {
  const { t } = useI18n();
  return (
    <span className="brand-copy">
      <span className="brand-name">
        Through<em>line</em>
      </span>
      <span className="brand-sub">{t('Delivery workspace')}</span>
    </span>
  );
}

export function GlobalHeader() {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <header className="global-header">
      <div className="global-header-inner">
        <Link to="/teams" className="sidebar-brand" aria-label="Throughline">
          <BrandMark />
          <Wordmark />
        </Link>
        <nav className="global-header-nav" aria-label={t('Global navigation')}>
          <NavLink
            to="/teams"
            className={({ isActive }) => cn('global-nav-link', isActive && 'is-active')}
          >
            <Icon name="users" size={14} />
            {t('Teams')}
          </NavLink>
          <NavLink
            to="/projects"
            className={({ isActive }) => cn('global-nav-link', isActive && 'is-active')}
          >
            <Icon name="layers" size={14} />
            {t('Projects')}
          </NavLink>
          {user?.systemRole === 'admin' ? (
            <NavLink
              to="/admin/users"
              className={({ isActive }) => cn('global-nav-link', isActive && 'is-active')}
            >
              <Icon name="users" size={14} />
              {t('Users')}
            </NavLink>
          ) : null}
        </nav>
        <div className="global-header-right">
          <LanguageSwitch />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

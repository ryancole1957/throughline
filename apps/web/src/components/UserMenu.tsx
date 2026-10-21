import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { cn } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import { Avatar } from './ui';

export function UserMenu({
  subtitle,
  align = 'right',
}: {
  subtitle?: string;
  align?: 'left' | 'right';
}) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;
  const roleText =
    subtitle ??
    (user.systemRole === 'admin' ? t('System administrator') : user.title || t('Member'));

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className={cn('user-menu-trigger', open && 'is-open')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={user.name} size={27} />
        <span className="user-menu-copy">
          <span className="user-menu-name">{user.name}</span>
          <span className="user-menu-role">{roleText}</span>
        </span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open ? (
        <div
          className="popover"
          role="menu"
          style={align === 'left' ? { left: 0, right: 'auto' } : undefined}
        >
          <div className="popover-header">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button
            type="button"
            className="popover-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/account');
            }}
          >
            <Icon name="shield" size={14} />
            {t('Account security')}
          </button>
          {user.systemRole === 'admin' ? (
            <button
              type="button"
              className="popover-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/admin/users');
              }}
            >
              <Icon name="users" size={14} />
              {t('Users')}
            </button>
          ) : null}
          <button
            type="button"
            className="popover-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/teams');
            }}
          >
            <Icon name="users" size={14} />
            {t('Teams')}
          </button>
          <button
            type="button"
            className="popover-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/projects');
            }}
          >
            <Icon name="layers" size={14} />
            {t('All projects')}
          </button>
          <div className="popover-separator" />
          <button
            type="button"
            className="popover-item popover-item-danger"
            role="menuitem"
            onClick={() => void handleLogout()}
            disabled={busy}
          >
            <Icon name="logout" size={14} />
            {busy ? t('Signing out…') : t('Sign out')}
          </button>
          <div className="popover-foot">Throughline v{__APP_VERSION__}</div>
        </div>
      ) : null}
    </div>
  );
}

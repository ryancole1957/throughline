import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { GlobalHeader } from '../components/GlobalHeader';
import {
  Avatar,
  Button,
  Field,
  Input,
  PageHeader,
  StatusTag,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import { useToast } from '../lib/toast';

export function AccountPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  async function submit() {
    setError('');
    if (!currentPassword) {
      setError(t('Enter your current password'));
      return;
    }
    if (newPassword.length < 12) {
      setError(t('New password must be at least 12 characters'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('New passwords do not match'));
      return;
    }
    setBusy(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('Password updated. Other sessions have been signed out.'));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <div className="global-page">
      <GlobalHeader />
      <main className="global-content account-page">
        <PageHeader
          eyebrow={t('ACCOUNT')}
          title={t('Account security')}
          description={t('Manage your password and sessions.')}
        />

        <div className="panel">
          <div className="panel-body account-card">
            <div className="account-identity">
              <Avatar name={user.name} size={44} />
              <div className="account-identity-copy">
                <h2>{user.name}</h2>
                <p>
                  {user.title || t('No title')} · {user.email}
                </p>
              </div>
              <span style={{ marginLeft: 'auto' }}>
                <StatusTag tone={user.systemRole === 'admin' ? 'blue' : 'slate'}>
                  {t(user.systemRole === 'admin' ? 'Admin' : 'Member')}
                </StatusTag>
              </span>
            </div>

            <div className="account-meta-grid">
              <div className="account-meta-item">
                <dt>{t('Email')}</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="account-meta-item">
                <dt>{t('System role')}</dt>
                <dd>{t(user.systemRole === 'admin' ? 'Admin' : 'Member')}</dd>
              </div>
              <div className="account-meta-item">
                <dt>{t('Account created')}</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
            </div>

            <div className="account-form">
              <div className="form-section-title">
                <Icon name="key" size={14} />
                {t('Change password')}
              </div>
              {error ? (
                <div className="form-error" role="alert" style={{ marginTop: 10 }}>
                  <Icon name="alert" size={14} />
                  <span>{error}</span>
                </div>
              ) : null}
              <div className="form-stack" style={{ marginTop: 12 }}>
                <Field label={t('Current password')} htmlFor="account-current">
                  <Input
                    id="account-current"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </Field>
                <Field
                  label={t('New password')}
                  htmlFor="account-new"
                  hint={t('At least 12 characters. Other sessions will be signed out.')}
                >
                  <Input
                    id="account-new"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label={t('Confirm new password')} htmlFor="account-confirm">
                  <Input
                    id="account-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </Field>
                <div className="form-actions">
                  <Button variant="primary" onClick={() => void submit()} loading={busy}>
                    {t('Update password')}
                  </Button>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <div className="row-between">
                <div>
                  <div className="form-section-title">{t('End current session')}</div>
                  <p className="field-hint" style={{ marginTop: 3 }}>
                    {t('You will need to sign in again.')}
                  </p>
                </div>
                <Button
                  variant="danger"
                  iconLeft="logout"
                  onClick={() => void handleLogout()}
                  loading={logoutBusy}
                >
                  {t('Sign out')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

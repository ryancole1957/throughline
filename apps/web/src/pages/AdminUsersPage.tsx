import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { AdminUser, SystemRole } from '@throughline/shared';

import { Dialog } from '../components/Dialog';
import { GlobalHeader } from '../components/GlobalHeader';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormRow,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusTag,
} from '../components/ui';
import { api, describeError, errorFields } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import { useToast } from '../lib/toast';

interface UserForm {
  name: string;
  email: string;
  title: string;
  systemRole: SystemRole;
  status: 'active' | 'disabled';
  password: string;
}

const emptyForm: UserForm = {
  name: '',
  email: '',
  title: '',
  systemRole: 'member',
  status: 'active',
  password: '',
};

export function AdminUsersPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user: currentUser, refetchSession } = useAuth();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [busy, setBusy] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: api.users.list,
  });

  const users = usersQuery.data ?? [];
  const adminCount = users.filter((entry) => entry.systemRole === 'admin' && entry.status === 'active').length;
  const disabledCount = users.filter((entry) => entry.status === 'disabled').length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      title: user.title,
      systemRole: user.systemRole,
      status: user.status,
      password: '',
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (form.name.trim().length < 1) {
      toast.warning(t('Name is required'));
      return;
    }
    if (editing) {
      if (form.password && form.password.length < 12) {
        toast.warning(t('New password must be at least 12 characters'));
        return;
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        toast.warning(t('Enter a valid email address'));
        return;
      }
      if (form.password.length < 12) {
        toast.warning(t('Initial password must be at least 12 characters'));
        return;
      }
    }
    setBusy(true);
    try {
      if (editing) {
        await api.users.update(editing.id, {
          name: form.name.trim(),
          title: form.title.trim(),
          systemRole: form.systemRole,
          status: form.status,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success(t('Account updated'));
      } else {
        await api.users.create({
          name: form.name.trim(),
          email: form.email.trim(),
          title: form.title.trim(),
          systemRole: form.systemRole,
          password: form.password,
        });
        toast.success(t('Account created'));
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      if (editing?.id === currentUser?.id) refetchSession();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (error) {
      const fields = errorFields(error);
      if (Object.keys(fields).length) {
        toast.error(Object.values(fields)[0] ?? describeError(error));
      } else {
        toast.error(describeError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  const roleOptions = useMemo(
    () => [
      {
        value: 'member' as const,
        label: t('Member · project roles assigned by project leads'),
      },
      {
        value: 'admin' as const,
        label: t('Admin · manages all projects and accounts'),
      },
    ],
    [t],
  );

  return (
    <div className="global-page">
      <GlobalHeader />
      <main className="global-content admin-page">
        <PageHeader
          eyebrow={t('ADMINISTRATION')}
          title={t('User management')}
          description={t('Manage user accounts and access.')}
          meta={
            <div className="admin-header-meta">
              <span>
                {users.length === 1
                  ? t('{{count}} account', { count: users.length })
                  : t('{{count}} accounts', { count: users.length })}
              </span>
              <span>·</span>
              <span>
                {adminCount === 1
                  ? t('{{count}} admin', { count: adminCount })
                  : t('{{count}} admins', { count: adminCount })}
              </span>
              {disabledCount ? (
                <>
                  <span>·</span>
                  <span>{t('{{count}} disabled', { count: disabledCount })}</span>
                </>
              ) : null}
            </div>
          }
          actions={
            <Button variant="primary" iconLeft="plus" onClick={openCreate}>
              {t('New account')}
            </Button>
          }
        />

        <div className="notice notice-neutral" style={{ marginBottom: 16 }}>
          <Icon name="shield" size={14} />
          <span>
            {t(
              'Initial passwords are set at creation. Share them through a secure channel and ask the user to change the password under Account security after first sign-in. At least one active admin is required; disabling an account ends all its sessions immediately.',
            )}
          </span>
        </div>

        {usersQuery.isPending ? (
          <div className="panel">
            <LoadingState label={t('Loading accounts…')} />
          </div>
        ) : usersQuery.isError ? (
          <ErrorState
            message={describeError(usersQuery.error)}
            onRetry={() => void usersQuery.refetch()}
          />
        ) : users.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon="users"
              title={t('No accounts yet')}
              description={t('Create the first account, then add members to projects.')}
              action={
                <Button variant="primary" iconLeft="plus" onClick={openCreate}>
                  {t('New account')}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="panel">
            <div className="panel-body-flush table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('User')}</th>
                    <th style={{ width: 200 }}>{t('System role')}</th>
                    <th style={{ width: 92 }}>{t('Status')}</th>
                    <th style={{ width: 96 }}>{t('Projects')}</th>
                    <th style={{ width: 142 }}>{t('Last sign-in')}</th>
                    <th style={{ width: 110 }}>{t('Created')}</th>
                    <th style={{ width: 90 }} />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="member-cell">
                          <Avatar name={user.name} size={28} />
                          <div className="member-cell-copy">
                            <div className="member-cell-name">{user.name}</div>
                            <div className="member-cell-email">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusTag tone={user.systemRole === 'admin' ? 'blue' : 'slate'}>
                          {t(user.systemRole === 'admin' ? 'Admin' : 'Member')}
                        </StatusTag>
                      </td>
                      <td>
                        <StatusTag tone={user.status === 'active' ? 'green' : 'gray'}>
                          {t(user.status === 'active' ? 'Active' : 'Disabled')}
                        </StatusTag>
                      </td>
                      <td className="num">{user.projectCount}</td>
                      <td className="muted small">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('Never')}
                      </td>
                      <td className="muted small">{formatDate(user.createdAt)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button size="sm" onClick={() => openEdit(user)}>
                          {t('Edit')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? t('Edit account') : t('New account')}
        description={
          editing
            ? t('Update account details, system role, or status. Changes apply immediately.')
            : t('Project leads add new users to projects and assign roles separately.')
        }
        size="md"
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={() => void submit()} loading={busy}>
              {editing ? t('Save changes') : t('Create account')}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <FormRow>
            <Field label={t('Name')} htmlFor="admin-name" required>
              <Input
                id="admin-name"
                data-autofocus
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </Field>
            <Field label={t('Title')} htmlFor="admin-title">
              <Input
                id="admin-title"
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder={t('e.g. Platform engineer')}
              />
            </Field>
          </FormRow>
          <Field label={t('Email')} htmlFor="admin-email" required={!editing}>
            <Input
              id="admin-email"
              type="email"
              value={form.email}
              disabled={Boolean(editing)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder={t('name@organization.com')}
            />
          </Field>
          <Field label={t('System role')} htmlFor="admin-role" required>
            <Select
              id="admin-role"
              value={form.systemRole}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  systemRole: event.target.value as SystemRole,
                }))
              }
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {editing ? (
            <Field label={t('Account status')} htmlFor="admin-status">
              <Select
                id="admin-status"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as 'active' | 'disabled',
                  }))
                }
              >
                <option value="active">{t('Active')}</option>
                <option value="disabled">{t('Disabled')}</option>
              </Select>
            </Field>
          ) : null}
          <Field
            label={editing ? t('Reset password') : t('Initial password')}
            htmlFor="admin-password"
            required={!editing}
            hint={
              editing
                ? t(
                    "Leave blank to keep the current password. Setting one signs out all of this account's sessions.",
                  )
                : t('At least 12 characters. Share it through a secure channel.')
            }
          >
            <Input
              id="admin-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder={
                editing
                  ? t('Leave blank to keep the current password')
                  : t('At least 12 characters')
              }
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

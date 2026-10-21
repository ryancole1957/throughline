import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TeamDetail, TeamMember, TeamRole } from '@throughline/shared';
import { updateTeamSchema } from '@throughline/shared';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateProjectDialog } from '../components/CreateProjectDialog';
import { Dialog } from '../components/Dialog';
import { GlobalHeader } from '../components/GlobalHeader';
import {
  Avatar,
  Button,
  DualProgress,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  MetaItem,
  PageHeader,
  StatusTag,
} from '../components/ui';
import { api, describeError, errorFields, type UpdateTeamInput } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn, dueLabel, dueTone, formatDate } from '../lib/format';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { PROJECT_STAGE_LABELS, stageTone } from '../lib/labels';
import { useToast } from '../lib/toast';

export function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateBusy, setRotateBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const teamQuery = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => api.teams.get(teamId!),
    enabled: Boolean(teamId),
  });
  const team = teamQuery.data;
  const isOwner = team?.role === 'owner';

  if (teamQuery.isPending) {
    return (
      <div className="global-page">
        <GlobalHeader />
        <main className="global-content">
          <div className="panel">
            <LoadingState label={t('Loading team…')} />
          </div>
        </main>
      </div>
    );
  }

  if (teamQuery.isError || !team) {
    return (
      <div className="global-page">
        <GlobalHeader />
        <main className="global-content">
          <ErrorState
            message={teamQuery.isError ? describeError(teamQuery.error) : t('Team not found')}
            onRetry={() => void teamQuery.refetch()}
          />
          <div style={{ marginTop: 16 }}>
            <Link className="text-link" to="/teams">
              {t('Back to teams')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  function invalidateTeam() {
    void queryClient.invalidateQueries({ queryKey: ['team', team?.id] });
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('Copied'));
    } catch {
      toast.error(t('Could not copy'));
    }
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setInviteBusy(true);
    setInviteError('');
    try {
      await api.teams.addMember(team!.id, { email: email.trim() });
      setEmail('');
      invalidateTeam();
      toast.success(t('Member added'));
    } catch (error) {
      setInviteError(describeError(error));
    } finally {
      setInviteBusy(false);
    }
  }

  async function rotateCode() {
    setRotateBusy(true);
    try {
      await api.teams.rotateJoinCode(team!.id);
      invalidateTeam();
      setRotateOpen(false);
      toast.success(t('Invite code regenerated'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setRotateBusy(false);
    }
  }

  async function removeMember() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await api.teams.removeMember(team!.id, removeTarget.userId);
      invalidateTeam();
      setRemoveTarget(null);
      toast.success(t('Member removed'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setRemoveBusy(false);
    }
  }

  async function leaveTeam() {
    setLeaveBusy(true);
    try {
      await api.teams.leave(team!.id);
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('You left the team'));
      navigate('/teams');
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setLeaveBusy(false);
    }
  }

  const inviteLink = `${window.location.origin}/join/${team.joinCode}`;

  return (
    <div className="global-page">
      <GlobalHeader />
      <main className="global-content">
        <PageHeader
          eyebrow={t('TEAM')}
          title={team.name}
          meta={
            <>
              <MetaItem icon="users">
                {t(team.memberCount === 1 ? '{{count}} member' : '{{count}} members', {
                  count: team.memberCount,
                })}
              </MetaItem>
              <MetaItem icon="layers">
                {t(team.projectCount === 1 ? '{{count}} project' : '{{count}} projects', {
                  count: team.projectCount,
                })}
              </MetaItem>
              <StatusTag tone={isOwner ? 'blue' : 'slate'}>
                {t(team.role === 'owner' ? 'Owner' : 'Member')}
              </StatusTag>
            </>
          }
          actions={
            <>
              {!isOwner ? (
                <Button onClick={() => setLeaveOpen(true)}>{t('Leave team')}</Button>
              ) : (
                <Button onClick={() => setRenameOpen(true)}>{t('Rename team')}</Button>
              )}
              <Button variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
                {t('New project')}
              </Button>
            </>
          }
        />

        <div className="team-detail-grid">
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('Invite teammates')}</span>
            </div>
            <div className="panel-body">
              <div className="invite-code-row">
                <span className="invite-code mono">{team.joinCode}</span>
                <Button size="sm" onClick={() => void copy(team.joinCode)}>
                  {t('Copy code')}
                </Button>
                <Button size="sm" onClick={() => void copy(inviteLink)}>
                  {t('Copy invite link')}
                </Button>
                {isOwner ? (
                  <Button size="sm" variant="ghost" onClick={() => setRotateOpen(true)}>
                    {t('Regenerate')}
                  </Button>
                ) : null}
              </div>
              {isOwner ? (
                <form className="invite-form" onSubmit={(event) => void addMember(event)}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('Add a registered teammate by email.')}
                    aria-label={t('Email address')}
                  />
                  <Button type="submit" size="sm" loading={inviteBusy}>
                    {t('Add member')}
                  </Button>
                  {inviteError ? (
                    <div className="form-error" role="alert">
                      <Icon name="alert" size={13} />
                      <span>{inviteError}</span>
                    </div>
                  ) : null}
                </form>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('Members')}</span>
              <span className="panel-description">
                {t(team.members.length === 1 ? '{{count}} member' : '{{count}} members', {
                  count: team.members.length,
                })}
              </span>
            </div>
            <div className="panel-body-flush table-responsive">
              <table className="data-table team-members-table">
                <thead>
                  <tr>
                    <th>{t('Member')}</th>
                    <th style={{ width: 108 }}>{t('Role')}</th>
                    <th style={{ width: 118 }}>{t('Joined')}</th>
                    <th style={{ width: 44 }} aria-label={t('Actions')} />
                  </tr>
                </thead>
                <tbody>
                  {team.members.map((member) => (
                    <tr key={member.userId}>
                      <td>
                        <div className="member-cell">
                          <Avatar name={member.name} size={24} />
                          <div>
                            <div className="member-name">{member.name}</div>
                            <div className="member-email">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusTag tone={member.role === 'owner' ? 'blue' : 'slate'}>
                          {t(roleLabel(member.role))}
                        </StatusTag>
                      </td>
                      <td className="muted">{formatDate(member.joinedAt)}</td>
                      <td>
                        {isOwner &&
                        member.role !== 'owner' &&
                        member.userId !== user?.id ? (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={t('Remove {{name}}', { name: member.name })}
                            onClick={() => setRemoveTarget(member)}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel team-projects-panel">
            <div className="panel-header">
              <span className="panel-title">{t('Projects in this team')}</span>
              <span className="panel-description">
                {t(team.projects.length === 1 ? '{{count}} project' : '{{count}} projects', {
                  count: team.projects.length,
                })}
              </span>
              <div className="panel-actions">
                <Button size="sm" iconLeft="plus" onClick={() => setCreateOpen(true)}>
                  {t('New project')}
                </Button>
              </div>
            </div>
            {team.projects.length === 0 ? (
              <div className="panel-body">
                <EmptyState
                  icon="layers"
                  title={t('No projects yet')}
                  description={t('Create the first project for this team.')}
                  action={
                    <Button variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
                      {t('Create project')}
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="panel-body-flush table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('Project')}</th>
                      <th style={{ width: 120 }}>{t('Stage')}</th>
                      <th style={{ width: 100 }}>{t('Deadline')}</th>
                      <th style={{ width: 180 }}>{t('Submitted / Accepted')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.projects.map((project) => {
                      const closed = project.stage === 'closed';
                      return (
                        <tr
                          key={project.id}
                          className="row-interactive"
                          tabIndex={0}
                          onClick={() => navigate(`/projects/${project.id}/dashboard`)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              navigate(`/projects/${project.id}/dashboard`);
                            }
                          }}
                        >
                          <td>
                            <div className="project-name">{project.name}</div>
                            <div className="project-sub">
                              <span className="mono">{project.code}</span>
                            </div>
                          </td>
                          <td>
                            <StatusTag tone={stageTone(project.stage)}>
                              {t(PROJECT_STAGE_LABELS[project.stage])}
                            </StatusTag>
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
                                <strong>{project.stats.submittedItems}</strong> /{' '}
                                {project.stats.totalItems}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {createOpen ? (
        <CreateProjectDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          teams={[team]}
          defaultTeamId={team.id}
          onCreated={(project) => {
            setCreateOpen(false);
            invalidateTeam();
            navigate(`/projects/${project.id}/dashboard`);
          }}
        />
      ) : null}

      {renameOpen ? (
        <RenameTeamDialog
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          team={team}
          onRenamed={() => {
            setRenameOpen(false);
            invalidateTeam();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        onConfirm={() => void rotateCode()}
        title={t('Regenerate invite code')}
        description={t('Regenerating the code invalidates the previous invite link.')}
        confirmLabel={t('Regenerate')}
        busy={rotateBusy}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => void removeMember()}
        title={t('Remove member')}
        description={t('Remove {{name}} from the team?', {
          name: removeTarget?.name ?? '',
        })}
        confirmLabel={t('Remove')}
        danger
        busy={removeBusy}
      >
        <p className="muted">{t('Their project roles in this team will also be removed.')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => void leaveTeam()}
        title={t('Leave team')}
        description={t('Leave {{name}}?', { name: team.name })}
        confirmLabel={t('Leave team')}
        danger
        busy={leaveBusy}
      >
        <p className="muted">{t('You will lose access to all projects in this team.')}</p>
      </ConfirmDialog>
    </div>
  );
}

function RenameTeamDialog({
  open,
  onClose,
  team,
  onRenamed,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamDetail;
  onRenamed: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTeamInput>({
    resolver: zodResolver(updateTeamSchema),
    defaultValues: { name: team.name },
  });

  async function onSubmit(values: UpdateTeamInput) {
    setServerError('');
    try {
      await api.teams.update(team.id, values);
      await queryClient.invalidateQueries({ queryKey: ['team', team.id] });
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(t('Team renamed'));
      onRenamed();
    } catch (error) {
      const fields = errorFields(error);
      if (fields.name) setError('name', { message: fields.name });
      else setServerError(describeError(error));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('Rename team')}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            type="submit"
            form="rename-team-form"
            loading={isSubmitting}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <form
        id="rename-team-form"
        className="form-stack"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        {serverError ? (
          <div className="form-error" role="alert">
            <Icon name="alert" size={14} />
            <span>{serverError}</span>
          </div>
        ) : null}
        <Field
          label={t('Team name')}
          htmlFor="rename-team-name"
          required
          error={errors.name?.message}
        >
          <Input id="rename-team-name" autoFocus {...register('name')} />
        </Field>
      </form>
    </Dialog>
  );
}

function roleLabel(role: TeamRole): string {
  return role === 'owner' ? 'Owner' : 'Member';
}

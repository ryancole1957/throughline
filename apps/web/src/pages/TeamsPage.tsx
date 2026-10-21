import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import type { TeamDetail, TeamSummary } from '@throughline/shared';
import { createTeamSchema, joinTeamSchema } from '@throughline/shared';

import { Dialog } from '../components/Dialog';
import { GlobalHeader } from '../components/GlobalHeader';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  MetaItem,
  PageHeader,
  StatusTag,
} from '../components/ui';
import {
  ApiError,
  api,
  describeError,
  errorFields,
  type CreateTeamInput,
  type JoinTeamInput,
} from '../lib/api';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';

export function TeamsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: api.teams.list });

  const teams = teamsQuery.data ?? [];
  const totalProjects = teams.reduce((sum, team) => sum + team.projectCount, 0);

  return (
    <div className="global-page">
      <GlobalHeader />
      <main className="global-content">
        <PageHeader
          eyebrow={t('WORKSPACE')}
          title={t('Your teams')}
          meta={
            <>
              <MetaItem icon="users">
                {t(teams.length === 1 ? '{{count}} team' : '{{count}} teams', {
                  count: teams.length,
                })}
              </MetaItem>
              <MetaItem icon="layers">
                {t(totalProjects === 1 ? '{{count}} project' : '{{count}} projects', {
                  count: totalProjects,
                })}
              </MetaItem>
            </>
          }
          actions={
            <>
              <Button onClick={() => setJoinOpen(true)}>{t('Join team')}</Button>
              <Button variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
                {t('New team')}
              </Button>
            </>
          }
        />

        {teamsQuery.isPending ? (
          <div className="panel">
            <LoadingState label={t('Loading teams…')} />
          </div>
        ) : teamsQuery.isError ? (
          <ErrorState
            message={describeError(teamsQuery.error)}
            onRetry={() => void teamsQuery.refetch()}
          />
        ) : teams.length === 0 ? (
          <EmptyState
            icon="users"
            title={t('No teams yet')}
            description={t('Create a team or join one with an invite code.')}
            action={
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={() => setJoinOpen(true)}>{t('Join with code')}</Button>
                <Button variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
                  {t('Create team')}
                </Button>
              </div>
            }
          />
        ) : (
          <div className="team-grid">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        )}
      </main>

      {createOpen ? (
        <CreateTeamDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(team) => {
            setCreateOpen(false);
            navigate(`/teams/${team.id}`);
          }}
        />
      ) : null}

      {joinOpen ? (
        <JoinTeamDialog
          open={joinOpen}
          onClose={() => setJoinOpen(false)}
          onJoined={(team) => {
            setJoinOpen(false);
            navigate(`/teams/${team.id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function TeamCard({ team }: { team: TeamSummary }) {
  const { t } = useI18n();
  return (
    <Link to={`/teams/${team.id}`} className="team-card">
      <div className="team-card-top">
        <span className="team-card-name">{team.name}</span>
        <StatusTag tone={team.role === 'owner' ? 'blue' : 'slate'}>
          {t(team.role === 'owner' ? 'Owner' : 'Member')}
        </StatusTag>
      </div>
      <div className="team-card-meta">
        <span>
          <Icon name="users" size={13} />
          {t(team.memberCount === 1 ? '{{count}} member' : '{{count}} members', {
            count: team.memberCount,
          })}
        </span>
        <span>
          <Icon name="layers" size={13} />
          {t(team.projectCount === 1 ? '{{count}} project' : '{{count}} projects', {
            count: team.projectCount,
          })}
        </span>
      </div>
      <span className="team-card-open">
        {t('Open team')}
        <Icon name="arrowRight" size={13} />
      </span>
    </Link>
  );
}

function CreateTeamDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (team: TeamDetail) => void;
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
  } = useForm<CreateTeamInput>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: '' },
  });

  async function onSubmit(values: CreateTeamInput) {
    setServerError('');
    try {
      const team = await api.teams.create(values);
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(t('Team created'));
      onCreated(team);
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
      title={t('Create team')}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            type="submit"
            form="create-team-form"
            loading={isSubmitting}
          >
            {t('Create team')}
          </Button>
        </>
      }
    >
      <form
        id="create-team-form"
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
          htmlFor="team-name"
          required
          error={errors.name?.message}
        >
          <Input
            id="team-name"
            autoFocus
            placeholder={t('e.g. Platform Engineering')}
            {...register('name')}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function JoinTeamDialog({
  open,
  onClose,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  onJoined: (team: TeamDetail) => void;
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
  } = useForm<JoinTeamInput>({
    resolver: zodResolver(joinTeamSchema),
    defaultValues: { code: '' },
  });

  async function onSubmit(values: JoinTeamInput) {
    setServerError('');
    try {
      const result = await api.teams.join(values.code);
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(t('Joined team'));
      onJoined(result.team);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invalid_join_code') {
        setError('code', { message: describeError(error) });
      } else {
        setServerError(describeError(error));
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('Join team')}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            type="submit"
            form="join-team-form"
            loading={isSubmitting}
          >
            {t('Join team')}
          </Button>
        </>
      }
    >
      <form
        id="join-team-form"
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
          label={t('Invite code')}
          htmlFor="team-join-code"
          required
          error={errors.code?.message}
        >
          <Input
            id="team-join-code"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={t('Enter the invite code you received')}
            {...register('code')}
          />
        </Field>
      </form>
    </Dialog>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ProjectSummary, TeamSummary } from '@throughline/shared';
import { createProjectSchema } from '@throughline/shared';

import { Dialog } from './Dialog';
import { Button, Field, FormRow, Input, Select, Textarea } from './ui';
import { ApiError, api, describeError, errorFields, type CreateProjectInput } from '../lib/api';
import { addDaysInput, todayInput } from '../lib/format';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';

function createDefaults(defaultTeamId?: string): CreateProjectInput {
  const year = new Date().getFullYear();
  const suffix = String(Math.floor(Math.random() * 900) + 100);
  return {
    teamId: defaultTeamId ?? '',
    code: `TL-${year}-${suffix}`,
    name: '',
    client: '',
    kickoff: todayInput(),
    deadline: addDaysInput(14),
    scope: '',
  };
}

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  teams,
  defaultTeamId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: ProjectSummary) => void;
  teams: TeamSummary[];
  defaultTeamId?: string;
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
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: createDefaults(defaultTeamId ?? teams[0]?.id),
  });

  async function onSubmit(values: CreateProjectInput) {
    setServerError('');
    try {
      const project = await api.projects.create(values);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      await queryClient.invalidateQueries({ queryKey: ['team', values.teamId] });
      toast.success(t('Project created'));
      onCreated(project);
    } catch (error) {
      const fields = errorFields(error);
      for (const [field, message] of Object.entries(fields)) {
        if (
          field === 'teamId' ||
          field === 'code' ||
          field === 'name' ||
          field === 'client' ||
          field === 'kickoff' ||
          field === 'deadline' ||
          field === 'scope'
        ) {
          setError(field, { message });
        }
      }
      if (error instanceof ApiError && error.code === 'project_code_exists') {
        setError('code', { message: error.message });
      } else {
        setServerError(describeError(error));
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('Create project')}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            type="submit"
            form="create-project-form"
            loading={isSubmitting}
          >
            {t('Create project')}
          </Button>
        </>
      }
    >
      <form
        id="create-project-form"
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
        <Field label={t('Team')} htmlFor="project-team" required error={errors.teamId?.message}>
          <Select id="project-team" {...register('teamId')}>
            {teams.length ? null : <option value="">{t('No teams available')}</option>}
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </Field>
        <FormRow>
          <Field
            label={t('Project code')}
            htmlFor="project-code"
            required
            error={errors.code?.message}
            hint={t('Uppercase letters, digits, and hyphens')}
          >
            <Input
              id="project-code"
              placeholder="TL-2026-008"
              autoComplete="off"
              {...register('code')}
            />
          </Field>
          <Field
            label={t('Project name')}
            htmlFor="project-name"
            required
            error={errors.name?.message}
          >
            <Input
              id="project-name"
              placeholder={t('e.g. Core billing system v3.2 delivery')}
              autoComplete="off"
              {...register('name')}
            />
          </Field>
        </FormRow>
        <Field
          label={t('Client / organization')}
          htmlFor="project-client"
          error={errors.client?.message}
        >
          <Input
            id="project-client"
            placeholder={t('e.g. Acme Corp (redacted)')}
            {...register('client')}
          />
        </Field>
        <FormRow>
          <Field
            label={t('Kickoff date')}
            htmlFor="project-kickoff"
            required
            error={errors.kickoff?.message}
          >
            <Input id="project-kickoff" type="date" {...register('kickoff')} />
          </Field>
          <Field
            label={t('Deadline')}
            htmlFor="project-deadline"
            required
            error={errors.deadline?.message}
          >
            <Input id="project-deadline" type="date" {...register('deadline')} />
          </Field>
        </FormRow>
        <Field
          label={t('Out of scope')}
          htmlFor="project-scope-detail"
          error={errors.scope?.message}
        >
          <Textarea
            id="project-scope-detail"
            placeholder={t(
              'Work excluded from this delivery, credentials to rotate, or items to follow up.',
            )}
            {...register('scope')}
          />
        </Field>
      </form>
    </Dialog>
  );
}

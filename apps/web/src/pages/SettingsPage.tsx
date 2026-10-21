import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ProjectMember, ProjectRole, ProjectStageAction } from '@throughline/shared';
import { nextProjectStage } from '@throughline/shared';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { StageStepper } from '../components/Stepper';
import {
  Avatar,
  Button,
  Field,
  FormRow,
  Input,
  Select,
  StatusTag,
  Textarea,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { useDebouncedValue } from '../lib/hooks';
import { formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import {
  PROJECT_STAGE_LABELS,
  ROLE_LABELS,
  stageTone,
} from '../lib/labels';
import { useToast } from '../lib/toast';
import { useProject } from './ProjectShell';

interface StageActionRequest {
  action: ProjectStageAction;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
}

const REQUIRED_ROLES: ProjectRole[] = [
  'receiver',
  'delivery',
  'core_reviewer',
  'business_reviewer',
];

export function SettingsPage() {
  const { t, locale } = useI18n();
  const project = useProject();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [info, setInfo] = useState({
    name: project.name,
    client: project.client,
    deadline: project.deadline,
    scope: project.scope,
  });
  const [infoBusy, setInfoBusy] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState('');
  const debouncedCandidateQuery = useDebouncedValue(candidateQuery);
  const [candidateRole, setCandidateRole] = useState<ProjectRole>('observer');
  const [memberBusy, setMemberBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null);
  const [stageRequest, setStageRequest] = useState<StageActionRequest | null>(null);
  const [stageBusy, setStageBusy] = useState(false);

  const canManage = project.permissions.manageProject;
  const canManageMembers = project.permissions.manageMembers;
  const writable = project.status === 'active' && project.stage !== 'closed';

  useEffect(() => {
    // Keep the form in sync when project data changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInfo({
      name: project.name,
      client: project.client,
      deadline: project.deadline,
      scope: project.scope,
    });
  }, [project.name, project.client, project.deadline, project.scope]);

  const candidatesQuery = useQuery({
    queryKey: ['member-candidates', project.id, debouncedCandidateQuery],
    queryFn: () =>
      api.projects.memberCandidates(project.id, { q: debouncedCandidateQuery }),
    enabled: canManageMembers && debouncedCandidateQuery.trim().length >= 2,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['report', project.id] });
  }

  async function saveInfo() {
    if (info.name.trim().length < 2) {
      toast.warning(t('Project name is too short'));
      return;
    }
    if (info.deadline < project.kickoff) {
      toast.warning(t('Deadline cannot be earlier than the kickoff date'));
      return;
    }
    setInfoBusy(true);
    try {
      await api.projects.update(project.id, {
        name: info.name.trim(),
        client: info.client.trim(),
        deadline: info.deadline,
        scope: info.scope.trim(),
      });
      invalidate();
      toast.success(t('Project settings saved'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setInfoBusy(false);
    }
  }

  async function runStage(action: ProjectStageAction, message: string) {
    setStageBusy(true);
    try {
      await api.projects.stage(project.id, action);
      setStageRequest(null);
      invalidate();
      toast.success(message);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setStageBusy(false);
    }
  }

  async function addMember(userId: string) {
    const candidate = candidatesQuery.data?.find((item) => item.id === userId);
    if (!candidate) return;
    setMemberBusy(true);
    try {
      await api.projects.addMember(project.id, {
        email: candidate.email,
        role: candidateRole,
      });
      setCandidateQuery('');
      invalidate();
      toast.success(
        t('Added {{name}} as {{role}}', {
          name: candidate.name,
          role: t(ROLE_LABELS[candidateRole]),
        }),
      );
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setMemberBusy(false);
    }
  }

  async function removeMember() {
    if (!removeTarget) return;
    setMemberBusy(true);
    try {
      await api.projects.removeMember(project.id, removeTarget.userId);
      setRemoveTarget(null);
      invalidate();
      toast.success(t('Member removed'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setMemberBusy(false);
    }
  }

  const missingRoles = REQUIRED_ROLES.filter(
    (role) => !project.members.some((member) => member.role === role),
  );
  const nextStage = nextProjectStage(project.stage);
  const canPause = canManage && project.status === 'active' && project.stage !== 'closed';
  const canResume = canManage && project.status === 'paused';
  const canAdvance =
    canManage && project.status === 'active' && project.stage !== 'closed' && nextStage;
  const canReopen =
    canManage && (project.stage === 'signoff' || project.stage === 'closed');

  return (
    <>
      <div className="settings-grid">
        <div className="page-column">
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('Project settings')}</span>
              <span className="panel-description">
                {t('Code {{code}} · Kickoff {{date}}', {
                  code: project.code,
                  date: formatDate(project.kickoff),
                })}
              </span>
            </div>
            <div className="panel-body">
              {canManage && writable ? (
                <div className="settings-form">
                  <Field label={t('Project name')} htmlFor="settings-name" required>
                    <Input
                      id="settings-name"
                      value={info.name}
                      onChange={(event) =>
                        setInfo((prev) => ({ ...prev, name: event.target.value }))
                      }
                    />
                  </Field>
                  <FormRow>
                    <Field label={t('Client / Organization')} htmlFor="settings-client">
                      <Input
                        id="settings-client"
                        value={info.client}
                        onChange={(event) =>
                          setInfo((prev) => ({ ...prev, client: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t('Deadline')} htmlFor="settings-deadline" required>
                      <Input
                        id="settings-deadline"
                        type="date"
                        value={info.deadline}
                        onChange={(event) =>
                          setInfo((prev) => ({ ...prev, deadline: event.target.value }))
                        }
                      />
                    </Field>
                  </FormRow>
                  <Field label={t('Out of scope and exceptions')} htmlFor="settings-scope">
                    <Textarea
                      id="settings-scope"
                      value={info.scope}
                      onChange={(event) =>
                        setInfo((prev) => ({ ...prev, scope: event.target.value }))
                      }
                      style={{ minHeight: 100 }}
                    />
                  </Field>
                  <div className="form-actions">
                    <Button
                      variant="primary"
                      onClick={() => void saveInfo()}
                      loading={infoBusy}
                    >
                      {t('Save changes')}
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="account-meta-grid" style={{ borderTop: 0 }}>
                  <div className="account-meta-item">
                    <dt>{t('Project name')}</dt>
                    <dd>{project.name}</dd>
                  </div>
                  <div className="account-meta-item">
                    <dt>{t('Client / Organization')}</dt>
                    <dd>{project.client || '—'}</dd>
                  </div>
                  <div className="account-meta-item">
                    <dt>{t('Deadline')}</dt>
                    <dd>{formatDate(project.deadline)}</dd>
                  </div>
                  <div className="account-meta-item" style={{ gridColumn: '1 / -1' }}>
                    <dt>{t('Out of scope and exceptions')}</dt>
                    <dd>{project.scope || '—'}</dd>
                  </div>
                </dl>
              )}
            </div>
          </section>

          <section className="panel member-table">
            <div className="panel-header">
              <span className="panel-title">{t('Members')}</span>
              <span className="panel-description">
                {project.members.length === 1
                  ? t('{{count}} member', { count: project.members.length })
                  : t('{{count}} members', { count: project.members.length })}
              </span>
            </div>
            <div className="panel-body-flush table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('Member')}</th>
                    <th style={{ width: 132 }}>{t('Role')}</th>
                    <th style={{ width: 100 }}>{t('Joined')}</th>
                    <th style={{ width: 86 }} className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  {project.members.map((member) => (
                    <tr key={member.userId}>
                      <td>
                        <div className="member-cell">
                          <Avatar name={member.name} size={26} />
                          <div className="member-cell-copy">
                            <div className="member-cell-name">{member.name}</div>
                            <div className="member-cell-email">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusTag
                          tone={member.role === 'receiver' ? 'blue' : member.role === 'observer' ? 'gray' : 'slate'}
                        >
                          {t(ROLE_LABELS[member.role])}
                        </StatusTag>
                      </td>
                      <td className="muted small">{formatDate(member.joinedAt)}</td>
                      <td className="no-print" style={{ textAlign: 'right' }}>
                        {canManageMembers &&
                        writable &&
                        (member.role !== 'receiver' || project.isAdmin) ? (
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => setRemoveTarget(member)}
                          >
                            {t('Remove')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-body">
              {missingRoles.length ? (
                <div className="notice notice-warning" style={{ marginBottom: 12 }}>
                  <Icon name="alert" size={14} />
                  <span>
                    {t(
                      'Unassigned: {{roles}}. Missing roles block the related reviews, acceptance, or sign-off.',
                      {
                        roles: missingRoles
                          .map((role) => t(ROLE_LABELS[role]))
                          .join(locale === 'zh' ? '、' : ', '),
                      },
                    )}
                  </span>
                </div>
              ) : null}
              {canManageMembers && writable ? (
                <div className="member-add">
                  <Field label={t('Search members')} htmlFor="candidate-search">
                    <Input
                      id="candidate-search"
                      value={candidateQuery}
                      onChange={(event) => setCandidateQuery(event.target.value)}
                      placeholder={t('Search by name or email')}
                    />
                  </Field>
                  <Field label={t('Assign role')} htmlFor="candidate-role">
                    <Select
                      id="candidate-role"
                      value={candidateRole}
                      onChange={(event) =>
                        setCandidateRole(event.target.value as ProjectRole)
                      }
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}
              {candidateQuery.trim().length >= 2 ? (
                candidatesQuery.isPending ? (
                  <div className="hint" style={{ marginTop: 8 }}>
                    {t('Searching accounts…')}
                  </div>
                ) : candidatesQuery.data?.length ? (
                  <div className="member-candidates">
                    {candidatesQuery.data.map((candidate) => (
                      <div className="member-candidate" key={candidate.id}>
                        <Avatar name={candidate.name} size={24} />
                        <div className="member-candidate-copy">
                          <div className="member-candidate-name">{candidate.name}</div>
                          <div className="member-candidate-email">{candidate.email}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          loading={memberBusy}
                          onClick={() => void addMember(candidate.id)}
                        >
                          {t('Add as {{role}}', { role: t(ROLE_LABELS[candidateRole]) })}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hint" style={{ marginTop: 8 }}>
                    {t('No matching active accounts. An administrator creates new accounts.')}
                  </div>
                )
              ) : null}
              {!canManageMembers ? (
                <div className="hint">
                  {t('Only project leads and administrators can manage members.')}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="page-column">
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">{t('Project stage')}</span>
              <StatusTag tone={stageTone(project.stage)}>
                {t(PROJECT_STAGE_LABELS[project.stage])}
              </StatusTag>
              {project.status === 'paused' ? <StatusTag tone="amber">{t('Paused')}</StatusTag> : null}
            </div>
            <div className="panel-body">
              <StageStepper
                stage={project.stage}
                status={project.status}
                milestones={project.milestones}
                vertical
              />
              {canManage ? (
                <div className="stage-action-list" style={{ marginTop: 14 }}>
                  {canPause || canResume ? (
                    <div className="stage-action">
                      <Icon name={canPause ? 'pause' : 'play'} size={15} />
                      <div className="stage-action-copy">
                        <div className="stage-action-title">
                          {canPause ? t('Pause project') : t('Resume project')}
                        </div>
                        <div className="stage-action-desc">
                          {canPause
                            ? t('All write actions are locked while paused. Members can still view records.')
                            : t('Members can continue submitting, reviewing, and accepting work.')}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        loading={stageBusy}
                        onClick={() =>
                          void runStage(
                            canPause ? 'pause' : 'resume',
                            canPause ? t('Project paused') : t('Project resumed'),
                          )
                        }
                      >
                        {canPause ? t('Pause') : t('Resume')}
                      </Button>
                    </div>
                  ) : null}
                  {canAdvance && nextStage ? (
                    <div className="stage-action">
                      <Icon name="arrowRight" size={15} />
                      <div className="stage-action-copy">
                        <div className="stage-action-title">
                          {t('Advance to {{stage}}', {
                            stage: t(PROJECT_STAGE_LABELS[nextStage]),
                          })}
                        </div>
                        <div className="stage-action-desc">
                          {t(
                            'Advancing records the completion time. Confirm the current stage is finished.',
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          setStageRequest({
                            action: 'advance',
                            title: t('Advance project stage'),
                            description: t('The project moves from {{from}} to {{to}}.', {
                              from: t(PROJECT_STAGE_LABELS[project.stage]),
                              to: t(PROJECT_STAGE_LABELS[nextStage]),
                            }),
                            confirmLabel: t('Advance stage'),
                          })
                        }
                      >
                        {t('Advance')}
                      </Button>
                    </div>
                  ) : null}
                  {canReopen ? (
                    <div className="stage-action">
                      <Icon name="rotate" size={15} />
                      <div className="stage-action-copy">
                        <div className="stage-action-title">{t('Reopen project')}</div>
                        <div className="stage-action-desc">
                          {t(
                            'Voids the current conclusion and sign-offs and returns the project to Verification. History is kept.',
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setStageRequest({
                            action: 'reopen',
                            title: t('Reopen project'),
                            description: t(
                              'The current conclusion and sign-offs will be voided, and the project returns to Verification. This cannot be undone.',
                            ),
                            confirmLabel: t('Reopen project'),
                            danger: true,
                          })
                        }
                      >
                        {t('Reopen')}
                      </Button>
                    </div>
                  ) : null}
                  {!canPause && !canResume && !canAdvance && !canReopen ? (
                    <div className="hint">
                      {t('No manual stage actions are available.')}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="hint" style={{ marginTop: 12 }}>
                  {t('Project stages are managed by the project lead.')}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(stageRequest)}
        onClose={() => setStageRequest(null)}
        onConfirm={() => {
          if (!stageRequest) return;
          const messages: Record<ProjectStageAction, string> = {
            advance: t('Project stage advanced'),
            pause: t('Project paused'),
            resume: t('Project resumed'),
            reopen: t('Project reopened'),
          };
          void runStage(stageRequest.action, messages[stageRequest.action]);
        }}
        title={stageRequest?.title ?? ''}
        description={stageRequest?.description}
        confirmLabel={stageRequest?.confirmLabel ?? t('Confirm')}
        danger={stageRequest?.danger}
        busy={stageBusy}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => void removeMember()}
        title={t('Remove member')}
        description={t(
          'The member loses access to this project. Removal is blocked if they still own open risks, conditions, or active sign-offs.',
        )}
        confirmLabel={t('Remove member')}
        danger
        busy={memberBusy}
      >
        {removeTarget ? (
          <div className="member-cell">
            <Avatar name={removeTarget.name} size={26} />
            <div className="member-cell-copy">
              <div className="member-cell-name">{removeTarget.name}</div>
              <div className="member-cell-email">
                {removeTarget.email} · {t(ROLE_LABELS[removeTarget.role])}
              </div>
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Asset } from '@throughline/shared';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormRow,
  Input,
  LoadingState,
  Select,
  StatusTag,
  Textarea,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { cn, formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import {
  ASSET_SENSITIVITY_LABELS,
  ASSET_STATUS_LABELS,
  assetStatusTone,
  sensitivityTone,
} from '../lib/labels';
import { useToast } from '../lib/toast';
import { useProject } from './ProjectShell';

const ASSET_TYPES = [
  'Environment',
  'Repository',
  'Document',
  'Dataset',
  'Credential',
  'Configuration',
  'Tool',
  'Service',
  'Other',
];

export function AssetsPage() {
  const project = useProject();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<Asset | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'Environment',
    sensitivity: 'internal' as Asset['sensitivity'],
    reference: '',
    custodian: '',
    note: '',
  });

  const assetsQuery = useQuery({
    queryKey: ['assets', project.id],
    queryFn: () => api.assets.list(project.id),
  });

  const assets = assetsQuery.data ?? [];
  const writable = project.status === 'active' && project.stage !== 'closed';
  const canCreate = project.permissions.manageProject && writable;

  useEffect(() => {
    if (!focusId || !assets.length) return;
    document
      .getElementById(`asset-${focusId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, assets.length]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['assets', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['report', project.id] });
  }

  async function act(asset: Asset, action: 'verify' | 'rotate') {
    setBusyId(asset.id);
    try {
      await api.assets.act(asset.id, action);
      setRotateTarget(null);
      invalidate();
      toast.success(
        action === 'verify'
          ? t('Access verification recorded')
          : t('Credential rotated and confirmed'),
      );
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusyId(null);
    }
  }

  async function createAsset() {
    if (form.name.trim().length < 2 || !form.custodian.trim()) {
      toast.warning(t('Enter an asset name and custodian'));
      return;
    }
    setBusyId('create');
    try {
      await api.assets.create(project.id, {
        name: form.name.trim(),
        type: form.type.trim(),
        sensitivity: form.sensitivity,
        reference: form.reference.trim(),
        custodian: form.custodian.trim(),
        note: form.note.trim(),
      });
      setAddOpen(false);
      setForm({
        name: '',
        type: 'Environment',
        sensitivity: 'internal',
        reference: '',
        custodian: '',
        note: '',
      });
      invalidate();
      toast.success(t('Asset added'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="notice">
        <Icon name="lock" size={15} />
        <span>
          {t(
            'Indexes and references only. Keep credentials in the managed vault and never paste secrets here.',
          )}
        </span>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">{t('Assets and references')}</span>
          <span className="panel-description">
            {t('{{count}} assets', { count: assets.length })}
          </span>
          <div className="panel-actions">
            {canCreate ? (
              <Button size="sm" iconLeft="plus" onClick={() => setAddOpen(true)}>
                {t('Add asset')}
              </Button>
            ) : null}
          </div>
        </div>
        {assetsQuery.isPending ? (
          <LoadingState label={t('Loading assets…')} />
        ) : assetsQuery.isError ? (
          <ErrorState
            message={describeError(assetsQuery.error)}
            onRetry={() => void assetsQuery.refetch()}
          />
        ) : assets.length === 0 ? (
          <EmptyState
            icon="box"
            title={t('No assets yet')}
            description={t('Track repositories, environments, documents, and credentials with an owner.')}
            action={
              canCreate ? (
                <Button variant="primary" iconLeft="plus" onClick={() => setAddOpen(true)}>
                  {t('Add first asset')}
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="panel-body-flush table-responsive">
            <table className="data-table asset-table">
              <thead>
                <tr>
                  <th style={{ width: 58 }}>{t('ID')}</th>
                  <th>{t('Name')}</th>
                  <th style={{ width: 88 }}>{t('Type')}</th>
                  <th style={{ width: 66 }}>{t('Sensitivity')}</th>
                  <th>{t('Reference')}</th>
                  <th style={{ width: 110 }}>{t('Custodian')}</th>
                  <th style={{ width: 108 }}>{t('Access verification')}</th>
                  <th style={{ width: 136 }} />
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr
                    key={asset.id}
                    id={`asset-${asset.id}`}
                    style={
                      focusId === asset.id ? { background: 'var(--surface-hover)' } : undefined
                    }
                  >
                    <td className="cell-code">{asset.code}</td>
                    <td>
                      <div className="asset-name">{asset.name}</div>
                      {asset.note ? <div className="asset-note">{asset.note}</div> : null}
                    </td>
                    <td>{t(asset.type)}</td>
                    <td>
                      <StatusTag tone={sensitivityTone(asset.sensitivity)}>
                        {t(ASSET_SENSITIVITY_LABELS[asset.sensitivity])}
                      </StatusTag>
                    </td>
                    <td>
                      <span className="asset-ref">{asset.reference || '—'}</span>
                    </td>
                    <td>{asset.custodian}</td>
                    <td>
                      <div className="asset-status-line">
                        <StatusTag tone={assetStatusTone(asset.status)}>
                          {t(ASSET_STATUS_LABELS[asset.status])}
                        </StatusTag>
                        <span className="asset-status-note">
                          {asset.verifiedAt
                            ? t('Verified {{date}}', {
                                date: formatDate(asset.verifiedAt, true),
                              })
                            : '—'}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {asset.status === 'pending_verification' &&
                      project.permissions.verifyAssets &&
                      writable ? (
                        <Button
                          size="sm"
                          loading={busyId === asset.id}
                          onClick={() => void act(asset, 'verify')}
                        >
                          {t('Record verification')}
                        </Button>
                      ) : null}
                      {asset.status === 'pending_rotation' &&
                      project.permissions.rotateAssets &&
                      writable ? (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busyId === asset.id}
                          onClick={() => setRotateTarget(asset)}
                        >
                          {t('Mark rotated')}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('Add asset')}
        description={t('Record the reference and custodian; keep credentials in the vault.')}
        size="lg"
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>{t('Cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => void createAsset()}
              loading={busyId === 'create'}
            >
              {t('Add asset')}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <FormRow>
            <Field label={t('Asset name')} htmlFor="asset-name" required>
              <Input
                id="asset-name"
                data-autofocus
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder={t('e.g. Production console')}
              />
            </Field>
            <Field label={t('Type')} htmlFor="asset-type" required>
              <Select
                id="asset-type"
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value }))
                }
              >
                {ASSET_TYPES.map((type) => (
                  <option key={type}>{t(type)}</option>
                ))}
              </Select>
            </Field>
          </FormRow>
          <FormRow>
            <Field label={t('Sensitivity')} htmlFor="asset-sensitivity">
              <Select
                id="asset-sensitivity"
                value={form.sensitivity}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sensitivity: event.target.value as Asset['sensitivity'],
                  }))
                }
              >
                {Object.entries(ASSET_SENSITIVITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Custodian / team')} htmlFor="asset-custodian" required>
              <Input
                id="asset-custodian"
                value={form.custodian}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, custodian: event.target.value }))
                }
                placeholder={t('e.g. Platform team')}
              />
            </Field>
          </FormRow>
          <Field
            label={t('Reference / link')}
            htmlFor="asset-reference"
            hint={t('Do not paste passwords or tokens here.')}
          >
            <Input
              id="asset-reference"
              value={form.reference}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, reference: event.target.value }))
              }
              placeholder={t('e.g. vault: infra/sms-gateway')}
            />
          </Field>
          <Field label={t('Note')} htmlFor="asset-note">
            <Textarea
              id="asset-note"
              value={form.note}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, note: event.target.value }))
              }
              placeholder={t('Access constraints, rotation plan, or delivery notes.')}
              style={{ minHeight: 70 }}
            />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(rotateTarget)}
        onClose={() => setRotateTarget(null)}
        onConfirm={() => {
          if (rotateTarget) void act(rotateTarget, 'rotate');
        }}
        title={t('Confirm credential rotated')}
        description={t('This records the rotation and marks the asset verified.')}
        confirmLabel={t('Confirm rotated')}
        cancelLabel={t('Cancel')}
        danger
        busy={Boolean(rotateTarget && busyId === rotateTarget.id)}
      >
        {rotateTarget ? (
          <div className={cn('condition-card')} style={{ marginBottom: 0 }}>
            <div className="condition-body">
              {rotateTarget.code} · {rotateTarget.name}
            </div>
            <div className="condition-meta">
              <span>{t('Custodian {{name}}', { name: rotateTarget.custodian })}</span>
              <span>{t('Reference {{reference}}', { reference: rotateTarget.reference })}</span>
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

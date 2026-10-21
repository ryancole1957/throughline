import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Chain, HttpMethod } from '@throughline/shared';
import { HTTP_METHODS } from '@throughline/shared';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormRow,
  IconButton,
  Input,
  LoadingState,
  Select,
  StatusTag,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { cn } from '../lib/format';
import type { TagTone } from '../lib/labels';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { downscaleImage } from '../lib/image';
import { useToast } from '../lib/toast';
import { useProject } from './ProjectShell';

interface EndpointDraft {
  method: HttpMethod;
  path: string;
  note: string;
}

interface MappingFormState {
  title: string;
  page: string;
  url: string;
  endpoints: EndpointDraft[];
  service: string;
  tables: string;
  environment: string;
  ownerName: string;
}

function toMethod(value: string): HttpMethod {
  return HTTP_METHODS.find((method) => method === value.toUpperCase()) ?? 'GET';
}

const BLANK_ENDPOINT: EndpointDraft = { method: 'GET', path: '', note: '' };

const EMPTY_FORM: MappingFormState = {
  title: '',
  page: '',
  url: '',
  endpoints: [{ ...BLANK_ENDPOINT }],
  service: '',
  tables: '',
  environment: '',
  ownerName: '',
};

function methodTone(method: string): TagTone {
  switch (method) {
    case 'GET':
      return 'blue';
    case 'POST':
      return 'green';
    case 'PUT':
    case 'PATCH':
      return 'amber';
    case 'DELETE':
      return 'red';
    default:
      return 'slate';
  }
}

function searchIndex(mapping: Chain): string {
  return [
    mapping.title,
    mapping.page,
    mapping.url,
    mapping.service,
    mapping.tables,
    mapping.environment,
    mapping.ownerName,
    ...mapping.endpoints.flatMap((endpoint) => [endpoint.method, endpoint.path, endpoint.note]),
  ]
    .join(' ')
    .toLowerCase();
}

export function GraphPage() {
  const project = useProject();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Chain | null>(null);
  const [form, setForm] = useState<MappingFormState>(EMPTY_FORM);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Chain | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('focus'));
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [serviceFilter, setServiceFilter] = useState(searchParams.get('service') ?? '');
  const [methodFilter, setMethodFilter] = useState(searchParams.get('method') ?? '');
  const [shotOnly, setShotOnly] = useState(searchParams.get('shot') === '1');
  const paramsRef = useRef(searchParams);

  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);

  const [shotBlob, setShotBlob] = useState<Blob | null>(null);
  const [shotPreview, setShotPreview] = useState<string | null>(null);
  const [shotRemove, setShotRemove] = useState(false);
  const previewRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const chainsQuery = useQuery({
    queryKey: ['chains', project.id],
    queryFn: () => api.chains.list(project.id),
  });

  const mappings = useMemo(() => chainsQuery.data ?? [], [chainsQuery.data]);
  const selected = selectedId ? (mappings.find((m) => m.id === selectedId) ?? null) : null;
  const canManage =
    project.permissions.manageProject && project.status === 'active' && project.stage !== 'closed';

  const term = query.trim().toLowerCase();
  const hasFilters = Boolean(term || serviceFilter || methodFilter || shotOnly);

  const serviceOptions = useMemo(
    () => [...new Set(mappings.map((m) => m.service).filter(Boolean))].sort(),
    [mappings],
  );
  const methodOptions = useMemo(() => {
    const present = new Set(
      mappings.flatMap((m) => m.endpoints.map((e) => e.method.toUpperCase()).filter(Boolean)),
    );
    return HTTP_METHODS.filter((method) => present.has(method));
  }, [mappings]);

  const filtered = useMemo(
    () =>
      mappings.filter((mapping) => {
        if (serviceFilter && mapping.service !== serviceFilter) return false;
        if (
          methodFilter &&
          !mapping.endpoints.some((e) => e.method.toUpperCase() === methodFilter)
        ) {
          return false;
        }
        if (shotOnly && !mapping.hasScreenshot) return false;
        if (term && !searchIndex(mapping).includes(term)) return false;
        return true;
      }),
    [mappings, serviceFilter, methodFilter, shotOnly, term],
  );

  function patchParams(mutations: Record<string, string>) {
    const next = new URLSearchParams(paramsRef.current);
    for (const [key, value] of Object.entries(mutations)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Several filters can change before React re-renders, so carry the pending
    // value forward instead of rebuilding from a stale location each time.
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  function changeFilter(key: 'q' | 'service' | 'method' | 'shot', value: string) {
    patchParams({ [key]: value });
    if (key === 'q') setQuery(value);
    if (key === 'service') setServiceFilter(value);
    if (key === 'method') setMethodFilter(value);
    if (key === 'shot') setShotOnly(value === '1');
  }

  function clearFilters() {
    patchParams({ q: '', service: '', method: '', shot: '' });
    setQuery('');
    setServiceFilter('');
    setMethodFilter('');
    setShotOnly(false);
  }

  function openCard(id: string | null) {
    setSelectedId(id);
    patchParams({ focus: id ?? '' });
  }

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function clearShot() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setShotBlob(null);
    setShotPreview(null);
  }

  function resetShotState() {
    clearShot();
    setShotRemove(false);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError('');
    resetShotState();
    setFormOpen(true);
  }

  function openEdit(mapping: Chain) {
    setEditing(mapping);
    setForm({
      title: mapping.title,
      page: mapping.page,
      url: mapping.url,
      endpoints: mapping.endpoints.length
        ? mapping.endpoints.map((e) => ({
            method: toMethod(e.method),
            path: e.path,
            note: e.note,
          }))
        : [{ ...BLANK_ENDPOINT }],
      service: mapping.service,
      tables: mapping.tables,
      environment: mapping.environment,
      ownerName: mapping.ownerName,
    });
    setSaveError('');
    resetShotState();
    setFormOpen(true);
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning(t('Please choose an image file'));
      return;
    }
    try {
      const blob = await downscaleImage(file);
      clearShot();
      const url = URL.createObjectURL(blob);
      previewRef.current = url;
      setShotBlob(blob);
      setShotPreview(url);
      setShotRemove(false);
    } catch {
      toast.error(t('Could not read that image'));
    }
  }

  function updateField<K extends keyof MappingFormState>(key: K, value: MappingFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateEndpoint(index: number, patch: Partial<EndpointDraft>) {
    setForm((prev) => ({
      ...prev,
      endpoints: prev.endpoints.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function addEndpoint() {
    setForm((prev) => ({ ...prev, endpoints: [...prev.endpoints, { ...BLANK_ENDPOINT }] }));
  }

  function removeEndpoint(index: number) {
    setForm((prev) => ({
      ...prev,
      endpoints:
        prev.endpoints.length > 1 ? prev.endpoints.filter((_, i) => i !== index) : prev.endpoints,
    }));
  }

  async function saveMapping() {
    const cleaned: EndpointDraft[] = form.endpoints
      .map((e) => ({ method: toMethod(e.method), path: e.path.trim(), note: e.note.trim() }))
      .filter((e) => e.path.length > 0);
    if (!form.page.trim()) {
      setSaveError(t('Enter a page path'));
      return;
    }
    if (cleaned.length === 0) {
      setSaveError(t('Add at least one API endpoint'));
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      const payload = {
        title: form.title.trim(),
        page: form.page.trim(),
        url: form.url.trim(),
        endpoints: cleaned,
        service: form.service.trim(),
        tables: form.tables.trim(),
        environment: form.environment.trim(),
        ownerName: form.ownerName.trim(),
      };
      const prevIds = new Set(mappings.map((m) => m.id));
      let targetId: string | null = null;
      if (editing) {
        await api.chains.update(editing.id, payload);
        targetId = editing.id;
      } else {
        const created = await api.chains.create(project.id, payload);
        targetId = created.find((c) => !prevIds.has(c.id))?.id ?? null;
      }
      if (editing && shotRemove && !shotBlob) {
        await api.chains.removeScreenshot(editing.id);
      }
      if (shotBlob && targetId) {
        await api.chains.uploadScreenshot(targetId, shotBlob);
      }
      await queryClient.invalidateQueries({ queryKey: ['chains', project.id] });
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      resetShotState();
      toast.success(t('Mapping saved'));
    } catch (error) {
      setSaveError(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMapping() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.chains.remove(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: ['chains', project.id] });
      if (selectedId === deleteTarget.id) openCard(null);
      setDeleteTarget(null);
      toast.success(t('Mapping deleted'));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  const showExistingShot = Boolean(editing?.hasScreenshot) && !shotBlob && !shotRemove;

  return (
    <>
      <div className="page-toolbar">
        <label className="search-box">
          <Icon name="search" size={14} />
          <span className="sr-only">{t('Search mappings')}</span>
          <Input
            value={query}
            placeholder={t('Search page, endpoint, service, or owner')}
            onChange={(event) => changeFilter('q', event.target.value)}
          />
        </label>
        <Select
          className="filter-select"
          aria-label={t('Filter by service')}
          value={serviceFilter}
          onChange={(event) => changeFilter('service', event.target.value)}
        >
          <option value="">{t('All services')}</option>
          {serviceOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          className="filter-select"
          aria-label={t('Filter by method')}
          value={methodFilter}
          onChange={(event) => changeFilter('method', event.target.value)}
        >
          <option value="">{t('All methods')}</option>
          {methodOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          className={cn('toggle-filter', shotOnly && 'is-on')}
          aria-pressed={shotOnly}
          onClick={() => changeFilter('shot', shotOnly ? '' : '1')}
        >
          <Icon name="image" size={12} />
          {t('With screenshot')}
        </button>
        <span className="page-toolbar-spacer" />
        {canManage ? (
          <Button variant="primary" iconLeft="plus" onClick={openCreate}>
            {t('Add mapping')}
          </Button>
        ) : null}
      </div>

      <div className="items-summary-line">
        <span>
          {t('{{shown}} of {{total}} mappings', {
            shown: filtered.length,
            total: mappings.length,
          })}
        </span>
        {hasFilters ? (
          <>
            <span>·</span>
            <button type="button" className="text-link" onClick={clearFilters}>
              {t('Clear filters')}
            </button>
          </>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">{t('Mappings')}</span>
          <span className="panel-description">
            {t('Connect each frontend page to the backend endpoints it calls.')}
          </span>
        </div>
        {chainsQuery.isPending ? (
          <div className="panel-body">
            <LoadingState label={t('Loading mappings…')} />
          </div>
        ) : chainsQuery.isError ? (
          <div className="panel-body">
            <ErrorState
              message={describeError(chainsQuery.error)}
              onRetry={() => void chainsQuery.refetch()}
            />
          </div>
        ) : mappings.length === 0 ? (
          <div className="panel-body">
            <EmptyState
              icon="graph"
              title={t('No mappings yet')}
              description={t('Connect a frontend page to the API endpoints it depends on.')}
              action={
                canManage ? (
                  <Button variant="primary" iconLeft="plus" onClick={openCreate}>
                    {t('Add the first mapping')}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel-body">
            <EmptyState
              icon="search"
              title={t('No mappings match these filters')}
              description={t('Adjust or clear the filters to see all mappings.')}
              action={<Button onClick={clearFilters}>{t('Clear filters')}</Button>}
            />
          </div>
        ) : (
          <div className="panel-body">
            <div className="mapping-grid">
              {filtered.map((mapping) => (
                <button
                  type="button"
                  key={mapping.id}
                  className="mapping-card"
                  onClick={() => openCard(mapping.id)}
                >
                  <div className="mapping-thumb">
                    {mapping.hasScreenshot ? (
                      <img
                        src={api.chains.screenshotUrl(mapping.id)}
                        alt=""
                        loading="lazy"
                        className="mapping-thumb-img"
                      />
                    ) : (
                      <span className="mapping-thumb-empty">
                        <Icon name="image" size={22} />
                      </span>
                    )}
                    <span
                      className="mapping-endpoint-count"
                      title={t('{{count}} endpoints', { count: mapping.endpoints.length })}
                    >
                      <Icon name="code" size={11} />
                      {mapping.endpoints.length}
                    </span>
                  </div>
                  <div className="mapping-card-body">
                    <div className="mapping-card-title">
                      {mapping.title || mapping.page || t('Untitled page')}
                    </div>
                    <div className="mapping-card-route mono">{mapping.page || '—'}</div>
                    <div className="mapping-card-meta">
                      {mapping.service ? <span className="chip">{mapping.service}</span> : null}
                      {mapping.ownerName ? (
                        <span className="chip">
                          <Icon name="user" size={10} />
                          {mapping.ownerName}
                        </span>
                      ) : null}
                      {mapping.environment ? (
                        <span className="chip">{mapping.environment}</span>
                      ) : null}
                      {mapping.url ? (
                        <span className="chip">
                          <Icon name="external" size={10} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected ? (
        <Dialog
          open
          onClose={() => openCard(null)}
          placement="right"
          size="lg"
          title={selected.title || selected.page || t('Page details')}
          description={
            <div className="mapping-drawer-route mono">
              {selected.page}
              {selected.url ? (
                <a
                  className="mapping-url-link"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Icon name="external" size={12} />
                  {selected.url}
                </a>
              ) : null}
            </div>
          }
          bodyClassName="mapping-drawer-body"
          footer={
            canManage ? (
              <div className="mapping-drawer-actions">
                <Button
                  size="sm"
                  variant="primary"
                  iconLeft="edit"
                  onClick={() => {
                    openCard(null);
                    openEdit(selected);
                  }}
                >
                  {t('Edit mapping')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  iconLeft="trash"
                  onClick={() => setDeleteTarget(selected)}
                >
                  {t('Delete')}
                </Button>
              </div>
            ) : null
          }
        >
          {selected.hasScreenshot ? (
            <figure className="mapping-drawer-shot">
              <img src={api.chains.screenshotUrl(selected.id)} alt={selected.page} />
            </figure>
          ) : null}
          <div className="mapping-drawer-meta">
            <MetaRow label={t('Service')} value={selected.service} mono />
            <MetaRow label={t('Data tables')} value={selected.tables} mono />
            <MetaRow label={t('Environment')} value={selected.environment} />
            <MetaRow label={t('Owner')} value={selected.ownerName} />
          </div>
          <div className="drawer-section-title">
            {t('Endpoints')}
            <span className="section-hint">
              {t('{{count}} on this page', { count: selected.endpoints.length })}
            </span>
          </div>
          <div className="endpoint-list">
            {selected.endpoints.map((endpoint, index) => (
              <div className="endpoint-row" key={`${endpoint.method}-${endpoint.path}-${index}`}>
                <StatusTag tone={methodTone(endpoint.method)}>{endpoint.method || '—'}</StatusTag>
                <span className="endpoint-path mono">{endpoint.path}</span>
                {endpoint.note ? <span className="endpoint-note">{endpoint.note}</span> : null}
              </div>
            ))}
          </div>
        </Dialog>
      ) : null}

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('Edit mapping') : t('Add mapping')}
        size="lg"
        footer={
          <>
            <Button onClick={() => setFormOpen(false)}>{t('Cancel')}</Button>
            <Button variant="primary" onClick={() => void saveMapping()} loading={busy}>
              {t('Save')}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          {saveError ? (
            <div className="form-error" role="alert">
              <Icon name="alert" size={14} />
              <span>{saveError}</span>
            </div>
          ) : null}
          <FormRow>
            <Field label={t('Page title')} htmlFor="mapping-title">
              <Input
                id="mapping-title"
                data-autofocus
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder={t('Order management')}
              />
            </Field>
            <Field label={t('Page')} htmlFor="mapping-page" required>
              <Input
                id="mapping-page"
                value={form.page}
                onChange={(event) => updateField('page', event.target.value)}
                placeholder="/orders"
              />
            </Field>
          </FormRow>
          <Field
            label={t('Access URL')}
            htmlFor="mapping-url"
            hint={t('The link both sides open to view this page.')}
          >
            <Input
              id="mapping-url"
              value={form.url}
              onChange={(event) => updateField('url', event.target.value)}
              placeholder="https://app.example.com/orders"
            />
          </Field>

          <div className="form-section-title">
            <Icon name="code" size={13} />
            {t('Endpoints')}
          </div>
          <div className="endpoint-editor">
            {form.endpoints.map((endpoint, index) => (
              <div className="endpoint-editor-row" key={index}>
                <Select
                  className="endpoint-method"
                  value={endpoint.method}
                  aria-label={t('Method')}
                  onChange={(event) =>
                    updateEndpoint(index, { method: toMethod(event.target.value) })
                  }
                >
                  {HTTP_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </Select>
                <Input
                  className="endpoint-path-input"
                  value={endpoint.path}
                  aria-label={t('Path')}
                  placeholder="/api/orders"
                  onChange={(event) => updateEndpoint(index, { path: event.target.value })}
                />
                <Input
                  className="endpoint-note-input"
                  value={endpoint.note}
                  aria-label={t('Purpose')}
                  placeholder={t('List orders')}
                  onChange={(event) => updateEndpoint(index, { note: event.target.value })}
                />
                <IconButton
                  label={t('Remove endpoint')}
                  icon="x"
                  disabled={form.endpoints.length === 1}
                  onClick={() => removeEndpoint(index)}
                />
              </div>
            ))}
            <button type="button" className="text-link endpoint-add" onClick={addEndpoint}>
              <Icon name="plus" size={12} />
              {t('Add endpoint')}
            </button>
          </div>

          <FormRow>
            <Field label={t('Service')} htmlFor="mapping-service">
              <Input
                id="mapping-service"
                value={form.service}
                onChange={(event) => updateField('service', event.target.value)}
                placeholder="orders-api"
              />
            </Field>
            <Field label={t('Data tables')} htmlFor="mapping-tables">
              <Input
                id="mapping-tables"
                value={form.tables}
                onChange={(event) => updateField('tables', event.target.value)}
                placeholder="orders, order_items"
              />
            </Field>
          </FormRow>
          <FormRow>
            <Field label={t('Environment')} htmlFor="mapping-env">
              <Input
                id="mapping-env"
                value={form.environment}
                onChange={(event) => updateField('environment', event.target.value)}
                placeholder="Staging"
              />
            </Field>
            <Field label={t('Owner')} htmlFor="mapping-owner">
              <Input
                id="mapping-owner"
                value={form.ownerName}
                onChange={(event) => updateField('ownerName', event.target.value)}
                placeholder="Alex Morgan"
              />
            </Field>
          </FormRow>

          <div className="form-section-title">
            <Icon name="image" size={13} />
            {t('Screenshot')}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {shotBlob && shotPreview ? (
            <div className="mapping-shot-preview">
              <img src={shotPreview} alt={t('Screenshot preview')} />
              <div className="mapping-shot-actions">
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  {t('Replace')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    clearShot();
                    if (editing?.hasScreenshot) setShotRemove(true);
                  }}
                >
                  {t('Remove')}
                </Button>
              </div>
            </div>
          ) : showExistingShot && editing ? (
            <div className="mapping-shot-preview">
              <img src={api.chains.screenshotUrl(editing.id)} alt={t('Current screenshot')} />
              <div className="mapping-shot-actions">
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  {t('Replace')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setShotRemove(true)}>
                  {t('Remove')}
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="mapping-shot-dropzone"
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleFile(event.dataTransfer.files?.[0]);
              }}
              onPaste={(event) => {
                const file = Array.from(event.clipboardData.files).find((f) =>
                  f.type.startsWith('image/'),
                );
                if (file) void handleFile(file);
              }}
            >
              <Icon name="image" size={20} />
              <span>{t('Drop an image, paste, or click to choose')}</span>
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteMapping()}
        title={t('Delete mapping')}
        description={t('Delete this mapping? The project data is unchanged.')}
        confirmLabel={t('Delete')}
        danger
        busy={deleteBusy}
      />
    </>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="mapping-meta-row">
      <span className="mapping-meta-label">{label}</span>
      <span className={mono ? 'mono' : undefined}>{value}</span>
    </div>
  );
}

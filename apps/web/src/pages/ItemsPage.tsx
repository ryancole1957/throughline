import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import type {
  AcceptanceStatus,
  ItemSummary,
  Priority,
  SupplyStatus,
} from '@throughline/shared';
import { createItemSchema } from '@throughline/shared';

import { Dialog } from '../components/Dialog';
import { ItemDrawer, type DrawerTab } from '../components/ItemDrawer';
import {
  Button,
  DualProgress,
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
import {
  api,
  describeError,
  errorFields,
  type CreateItemInput,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  addDaysInput,
  cn,
  dueLabel,
  dueTone,
  formatDate,
} from '../lib/format';
import { useDebouncedValue } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';
import {
  ACCEPTANCE_LABELS,
  PRIORITY_LABELS,
  SUPPLY_LABELS,
  acceptanceTone,
  priorityTone,
  supplyTone,
} from '../lib/labels';
import { useToast } from '../lib/toast';
import { useProject } from './ProjectShell';

const ACCEPTANCE_OPTIONS = Object.keys(ACCEPTANCE_LABELS) as AcceptanceStatus[];
const SUPPLY_OPTIONS = Object.keys(SUPPLY_LABELS) as SupplyStatus[];
const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABELS) as Priority[];

export function ItemsPage() {
  const project = useProject();
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialModule = searchParams.get('module') ?? '';
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const debouncedQ = useDebouncedValue(q);
  const [module, setModule] = useState(initialModule);
  const [supply, setSupply] = useState<SupplyStatus | ''>('');
  const [acceptance, setAcceptance] = useState<AcceptanceStatus | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [mine, setMine] = useState(false);
  const [risky, setRisky] = useState(false);
  const [sort, setSort] = useState<'module' | 'due' | 'priority'>('module');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(
    searchParams.get('focus'),
  );
  const focusTab = (searchParams.get('tab') as DrawerTab | null) ?? 'review';

  const itemsQuery = useQuery({
    queryKey: [
      'items',
      project.id,
      { q: debouncedQ, module, supply, acceptance, priority, mine, risky, sort, page },
    ],
    queryFn: () =>
      api.items.list(project.id, {
        q: debouncedQ,
        module,
        supply: supply || undefined,
        acceptance: acceptance || undefined,
        priority: priority || undefined,
        mine,
        risky,
        sort,
        page,
        pageSize: 50,
      }),
    placeholderData: (previous) => previous,
  });

  const pageData = itemsQuery.data;
  const items = useMemo(() => pageData?.items ?? [], [pageData]);
  const modules = pageData?.modules ?? [];
  const grouped = useMemo(() => {
    const groups = new Map<string, ItemSummary[]>();
    for (const item of items) {
      const list = groups.get(item.module) ?? [];
      list.push(item);
      groups.set(item.module, list);
    }
    return [...groups.entries()];
  }, [items]);

  const hasFilters = Boolean(q || module || supply || acceptance || priority || mine || risky);
  const canCreate = project.permissions.createItem && project.status === 'active' && project.stage !== 'closed';

  function updateFilter(action: () => void) {
    action();
    setPage(1);
  }

  function clearFilters() {
    setQ('');
    setModule('');
    setSupply('');
    setAcceptance('');
    setPriority('');
    setMine(false);
    setRisky(false);
    setSort('module');
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete('module');
    setSearchParams(next, { replace: true });
  }

  function openItem(itemId: string, tab: DrawerTab = 'review') {
    setOpenItemId(itemId);
    const next = new URLSearchParams(searchParams);
    next.set('focus', itemId);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }

  function closeDrawer() {
    setOpenItemId(null);
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }

  function refreshAfterCreate(itemId: string) {
    void queryClient.invalidateQueries({ queryKey: ['items', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['overview', project.id] });
    void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    setCreateOpen(false);
    toast.success(t('Item created'));
    openItem(itemId);
  }

  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.pageSize)) : 1;

  return (
    <div>
      <div className="page-toolbar">
        <label className="search-box">
          <Icon name="search" size={14} />
          <span className="sr-only">{t('Search items')}</span>
          <Input
            value={q}
            placeholder={t('Search code, title, or review notes')}
            onChange={(event) => updateFilter(() => setQ(event.target.value))}
          />
        </label>
        <Select
          className="filter-select"
          aria-label={t('Filter by module')}
          value={module}
          onChange={(event) =>
            updateFilter(() => {
              setModule(event.target.value);
              const next = new URLSearchParams(searchParams);
              if (event.target.value) next.set('module', event.target.value);
              else next.delete('module');
              setSearchParams(next, { replace: true });
            })
          }
        >
          <option value="">{t('All modules')}</option>
          {modules.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select
          className="filter-select"
          aria-label={t('Filter by acceptance status')}
          value={acceptance}
          onChange={(event) =>
            updateFilter(() => setAcceptance(event.target.value as AcceptanceStatus | ''))
          }
        >
          <option value="">{t('Acceptance: All')}</option>
          {ACCEPTANCE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(ACCEPTANCE_LABELS[value])}
            </option>
          ))}
        </Select>
        <Select
          className="filter-select"
          aria-label={t('Filter by supply status')}
          value={supply}
          onChange={(event) =>
            updateFilter(() => setSupply(event.target.value as SupplyStatus | ''))
          }
        >
          <option value="">{t('Supply: All')}</option>
          {SUPPLY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(SUPPLY_LABELS[value])}
            </option>
          ))}
        </Select>
        <Select
          className="filter-select"
          aria-label={t('Filter by priority')}
          value={priority}
          onChange={(event) =>
            updateFilter(() => setPriority(event.target.value as Priority | ''))
          }
        >
          <option value="">{t('Priority: All')}</option>
          {PRIORITY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(PRIORITY_LABELS[value])}
            </option>
          ))}
        </Select>
        {user ? (
          <button
            type="button"
            className={cn('toggle-filter', mine && 'is-on')}
            aria-pressed={mine}
            onClick={() => updateFilter(() => setMine((value) => !value))}
          >
            {t('Only mine')}
          </button>
        ) : null}
        <button
          type="button"
          className={cn('toggle-filter', risky && 'is-on')}
          aria-pressed={risky}
          onClick={() => updateFilter(() => setRisky((value) => !value))}
        >
          <Icon name="alert" size={12} />
          {t('With risks')}
        </button>
        <span className="page-toolbar-spacer" />
        <Select
          className="filter-select"
          aria-label={t('Sort by')}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as 'module' | 'due' | 'priority');
            setPage(1);
          }}
        >
          <option value="module">{t('Group by module')}</option>
          <option value="due">{t('By due date')}</option>
          <option value="priority">{t('By priority')}</option>
        </Select>
        {canCreate ? (
          <Button variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
            {t('New item')}
          </Button>
        ) : null}
      </div>

      <div className="items-summary-line">
        <span>
          <strong>{pageData?.total ?? 0}</strong> {t('items')}
        </span>
        {hasFilters ? (
          <>
            <span>·</span>
            <button type="button" className="text-link" onClick={clearFilters}>
              {t('Clear filters')}
            </button>
          </>
        ) : null}
        {itemsQuery.isFetching && pageData ? <span className="spinner" /> : null}
      </div>

      {itemsQuery.isPending ? (
        <div className="panel">
          <LoadingState label={t('Loading items…')} />
        </div>
      ) : itemsQuery.isError ? (
        <ErrorState
          title={t('Unable to load items')}
          message={describeError(itemsQuery.error)}
          onRetry={() => void itemsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="list"
            title={hasFilters ? t('No items match these filters') : t('No items yet')}
            description={
              hasFilters
                ? t('Adjust or clear filters to see all items.')
                : canCreate
                  ? t('Create the first item to start this delivery.')
                  : t('The project owner has not added any items yet.')
            }
            action={
              hasFilters ? (
                <Button onClick={clearFilters}>{t('Clear filters')}</Button>
              ) : canCreate ? (
                <Button variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
                  {t('New item')}
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="panel">
          <div className="table-responsive">
            <table className="data-table items-table">
              <thead>
                <tr>
                  <th style={{ width: 68 }}>{t('Code')}</th>
                  <th>{t('Item')}</th>
                  <th style={{ width: 250 }}>{t('Progress')}</th>
                  <th style={{ width: 74 }}>{t('Supply')}</th>
                  <th style={{ width: 82 }}>{t('Acceptance')}</th>
                  <th style={{ width: 60 }}>{t('Priority')}</th>
                  <th style={{ width: 92 }}>{t('Due')}</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([groupModule, groupItems]) => {
                  const submitted = groupItems.filter(
                    (item) => item.supplyStatus === 'submitted',
                  ).length;
                  const settled = groupItems.filter((item) =>
                    ['passed', 'conditional'].includes(item.acceptanceStatus),
                  ).length;
                  const riskItems = groupItems.filter((item) => item.riskCodes.length).length;
                  return (
                    <ModuleGroup
                      key={groupModule}
                      module={groupModule}
                      items={groupItems}
                      submitted={submitted}
                      settled={settled}
                      riskItems={riskItems}
                      onOpen={openItem}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="panel-footer">
              <span className="faint small">
                {t('Page {{page}} of {{total}}', { page, total: totalPages })}
              </span>
              <span className="page-toolbar-spacer" />
              <Button
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('Previous')}
              </Button>
              <Button
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <ItemDrawer
        key={openItemId ?? 'closed'}
        project={project}
        itemId={openItemId}
        initialTab={focusTab}
        onClose={closeDrawer}
      />
      {createOpen ? <CreateItemDialog
        open={createOpen}
        projectId={project.id}
        modules={modules}
        onClose={() => setCreateOpen(false)}
        onCreated={refreshAfterCreate}
      /> : null}
    </div>
  );
}

function ModuleGroup({
  module,
  items,
  submitted,
  settled,
  riskItems,
  onOpen,
}: {
  module: string;
  items: ItemSummary[];
  submitted: number;
  settled: number;
  riskItems: number;
  onOpen: (itemId: string) => void;
}) {
  const project = useProject();
  const { t } = useI18n();
  const memberByRole = (role: string) =>
    project.members.find((member) => member.role === role);
  return (
    <>
      <tr className="group-row">
        <td colSpan={7}>
          <div className="group-header">
            <span className="group-header-name">{module}</span>
            <span className="group-header-meta">
              {t('Supply {{submitted}}/{{total}} · Acceptance {{settled}}/{{total}}', {
                submitted,
                settled,
                total: items.length,
              })}
            </span>
            <span className="group-header-bars">
              <DualProgress
                supply={submitted}
                accepted={settled}
                total={items.length}
                compact
              />
            </span>
            {riskItems ? (
              <StatusTag tone="gray">
                {t('{{count}} at risk', { count: riskItems })}
              </StatusTag>
            ) : null}
          </div>
        </td>
      </tr>
      {items.map((item) => {
        const complete = ['passed', 'conditional', 'not_applicable'].includes(
          item.acceptanceStatus,
        );
        const delivery = memberByRole('delivery');
        const core = memberByRole('core_reviewer');
        const business = memberByRole('business_reviewer');
        const receiver = memberByRole('receiver');
        return (
          <tr
            key={item.id}
            className="row-interactive"
            tabIndex={0}
            onClick={() => onOpen(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onOpen(item.id);
            }}
          >
            <td className="cell-code">{item.code}</td>
            <td>
              <div className="item-table-title">
                {item.title}
                {item.riskCodes.length ? (
                  <span className="item-table-risk">
                    <Icon name="alert" size={10} />
                    {item.riskCodes.join(' / ')}
                  </span>
                ) : null}
              </div>
              <div className="item-table-sub">{item.scope}</div>
            </td>
            <td>
              <div className="chain-summary" aria-label={t('Progress steps')}>
                <span
                  className="chain-item"
                  title={t('Delivery: {{name}}', { name: delivery?.name ?? t('Unassigned') })}
                >
                  <span
                    className={cn(
                      'chain-dot',
                      item.supplyStatus === 'submitted' && 'is-done',
                      item.supplyStatus === 'needs_information' && 'is-failed',
                    )}
                  />
                  {delivery?.name ?? t('Unassigned')}
                </span>
                {item.coreRequired ? (
                  <>
                    <span className="chain-arrow">›</span>
                    <span
                      className="chain-item"
                      title={t('Technical review: {{name}}', {
                        name: core?.name ?? t('Unassigned'),
                      })}
                    >
                      <span
                        className={cn(
                          'chain-dot',
                          item.latestCore?.decision === 'passed' && 'is-done',
                          (item.latestCore?.decision === 'returned' ||
                            item.latestCore?.decision === 'failed') &&
                            'is-failed',
                          !item.latestCore &&
                            item.supplyStatus === 'submitted' &&
                            'is-active',
                        )}
                      />
                      {core?.name ?? t('Unassigned')}
                    </span>
                  </>
                ) : null}
                {item.businessRequired ? (
                  <>
                    <span className="chain-arrow">›</span>
                    <span
                      className="chain-item"
                      title={t('Business review: {{name}}', {
                        name: business?.name ?? t('Unassigned'),
                      })}
                    >
                      <span
                        className={cn(
                          'chain-dot',
                          item.latestBusiness?.decision === 'confirmed' && 'is-done',
                          item.latestBusiness?.decision === 'returned' && 'is-failed',
                          !item.latestBusiness &&
                            item.supplyStatus === 'submitted' &&
                            'is-active',
                        )}
                      />
                      {business?.name ?? t('Unassigned')}
                    </span>
                  </>
                ) : null}
                <span className="chain-arrow">›</span>
                <span
                  className="chain-item"
                  title={t('Acceptance: {{name}}', {
                    name: receiver?.name ?? t('Unassigned'),
                  })}
                >
                  <span
                    className={cn(
                      'chain-dot',
                      ['passed', 'conditional'].includes(item.acceptanceStatus) && 'is-done',
                      item.acceptanceStatus === 'rejected' && 'is-failed',
                      item.acceptanceStatus === 'in_verification' && 'is-active',
                    )}
                  />
                  {receiver?.name ?? t('Unassigned')}
                </span>
              </div>
            </td>
            <td>
              <StatusTag tone={supplyTone(item.supplyStatus)}>
                {t(SUPPLY_LABELS[item.supplyStatus])}
              </StatusTag>
            </td>
            <td>
              <StatusTag tone={acceptanceTone(item.acceptanceStatus)}>
                {t(ACCEPTANCE_LABELS[item.acceptanceStatus])}
              </StatusTag>
            </td>
            <td>
              <StatusTag tone={priorityTone(item.priority)}>
                {t(PRIORITY_LABELS[item.priority])}
              </StatusTag>
            </td>
            <td>
              <div className={cn('due-cell', dueTone(item.dueDate, complete))}>
                <span>{formatDate(item.dueDate, true)}</span>
                <span className="due-caption">
                  {complete ? t('Done') : dueLabel(item.dueDate)}
                </span>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function createItemDefaults(module?: string): CreateItemInput {
  return {
    module: module || 'Business & customers',
    title: '',
    scope: '',
    priority: 'medium',
    dueDate: addDaysInput(7),
    rule: '',
    coreRequired: true,
    businessRequired: false,
  };
}

function CreateItemDialog({
  open,
  projectId,
  modules,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  modules: string[];
  onClose: () => void;
  onCreated: (itemId: string) => void;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateItemInput>({
    resolver: zodResolver(createItemSchema),
    defaultValues: createItemDefaults(modules[0]),
  });

  async function onSubmit(values: CreateItemInput) {
    setServerError('');
    try {
      const detail = await api.items.create(projectId, values);
      onCreated(detail.item.id);
    } catch (error) {
      const fields = errorFields(error);
      for (const [field, message] of Object.entries(fields)) {
        if (
          field === 'module' ||
          field === 'title' ||
          field === 'scope' ||
          field === 'priority' ||
          field === 'dueDate' ||
          field === 'rule'
        ) {
          setError(field, { message });
        }
      }
      setServerError(describeError(error));
      toast.error(describeError(error));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('New work item')}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            type="submit"
            form="create-item-form"
            loading={isSubmitting}
          >
            {t('Create item')}
          </Button>
        </>
      }
    >
      <form
        id="create-item-form"
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
        <FormRow>
          <Field
            label={t('Module')}
            htmlFor="item-module"
            required
            error={errors.module?.message}
          >
            <Input
              id="item-module"
              list="item-module-options"
              placeholder={t('e.g. Data & APIs')}
              {...register('module')}
            />
            <datalist id="item-module-options">
              {modules.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>
          <Field label={t('Priority')} htmlFor="item-priority" error={errors.priority?.message}>
            <Select id="item-priority" {...register('priority')}>
              {PRIORITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(PRIORITY_LABELS[value])}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <Field label={t('Title')} htmlFor="item-title" required error={errors.title?.message}>
          <Input
            id="item-title"
            placeholder={t('e.g. Search API contract')}
            {...register('title')}
          />
        </Field>
        <Field label={t('Scope')} htmlFor="item-scope" error={errors.scope?.message}>
          <Textarea
            id="item-scope"
            placeholder={t('What this item covers and excludes.')}
            style={{ minHeight: 68 }}
            {...register('scope')}
          />
        </Field>
        <Field
          label={t('Acceptance criteria')}
          htmlFor="item-rule"
          required
          error={errors.rule?.message}
        >
          <Textarea
            id="item-rule"
            placeholder={t('Describe reproducible pass conditions.')}
            {...register('rule')}
          />
        </Field>
        <FormRow>
          <Field label={t('Due date')} htmlFor="item-due" required error={errors.dueDate?.message}>
            <Input id="item-due" type="date" {...register('dueDate')} />
          </Field>
          <div className="field">
            <span className="field-label">{t('Required roles')}</span>
            <label className="checkbox-row" style={{ marginTop: 5 }}>
              <input type="checkbox" {...register('coreRequired')} />
              <span>{t('Technical review required')}</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" {...register('businessRequired')} />
              <span>{t('Business review required')}</span>
            </label>
          </div>
        </FormRow>
      </form>
    </Dialog>
  );
}

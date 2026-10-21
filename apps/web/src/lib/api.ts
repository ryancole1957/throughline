import type { z } from 'zod';
import type {
  AcceptanceStatus,
  AdminUser,
  Asset,
  AssetAction,
  Chain,
  Condition,
  Event,
  ItemDetail,
  ItemsPage,
  ItemSummary,
  Overview,
  Priority,
  ProjectDetail,
  ProjectMember,
  ProjectStageAction,
  ProjectSummary,
  ReportData,
  Risk,
  RiskAction,
  SessionInfo,
  Step,
  SupplyStatus,
  TeamDetail,
  TeamSummary,
  UserLookupResult,
  UserRef,
} from '@throughline/shared';
import type {
  acceptanceSchema,
  addEvidenceSchema,
  addMemberSchema,
  addTeamMemberSchema,
  answerNoteSchema,
  assetActionSchema,
  changePasswordSchema,
  conclusionSchema,
  createAssetSchema,
  createChainSchema,
  createItemSchema,
  createNoteSchema,
  createProjectSchema,
  createRiskSchema,
  createStepSchema,
  createTeamSchema,
  createUserSchema,
  joinTeamSchema,
  loginSchema,
  registerSchema,
  reviewSchema,
  riskTransitionSchema,
  signoffSchema,
  stepResultSchema,
  stepScopeSchema,
  updateChainSchema,
  updateItemSchema,
  updateProjectSchema,
  updateRiskSchema,
  updateRuleSchema,
  updateTeamSchema,
  updateUserSchema,
} from '@throughline/shared';

import { translateCurrent } from './i18n';

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type CreateTeamInput = z.input<typeof createTeamSchema>;
export type JoinTeamInput = z.input<typeof joinTeamSchema>;
export type UpdateTeamInput = z.input<typeof updateTeamSchema>;
export type AddTeamMemberInput = z.input<typeof addTeamMemberSchema>;
export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type CreateItemInput = z.input<typeof createItemSchema>;
export type UpdateItemInput = z.input<typeof updateItemSchema>;
export type UpdateRuleInput = z.input<typeof updateRuleSchema>;
export type AddEvidenceInput = z.input<typeof addEvidenceSchema>;
export type ReviewInput = z.input<typeof reviewSchema>;
export type AcceptanceInput = z.input<typeof acceptanceSchema>;
export type CreateNoteInput = z.input<typeof createNoteSchema>;
export type AnswerNoteInput = z.input<typeof answerNoteSchema>;
export type CreateRiskInput = z.input<typeof createRiskSchema>;
export type UpdateRiskInput = z.input<typeof updateRiskSchema>;
export type RiskTransitionInput = z.input<typeof riskTransitionSchema>;
export type CreateAssetInput = z.input<typeof createAssetSchema>;
export type AssetActionInput = z.input<typeof assetActionSchema>;
export type StepResultInput = z.input<typeof stepResultSchema>;
export type StepScopeInput = z.input<typeof stepScopeSchema>;
export type CreateStepInput = z.input<typeof createStepSchema>;
export type CreateChainInput = z.input<typeof createChainSchema>;
export type UpdateChainInput = z.input<typeof updateChainSchema>;
export type ConclusionInput = z.input<typeof conclusionSchema>;
export type SignoffInput = z.input<typeof signoffSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type AddMemberInput = z.input<typeof addMemberSchema>;

export interface ItemsQueryParams {
  q?: string;
  module?: string;
  supply?: SupplyStatus;
  acceptance?: AcceptanceStatus;
  priority?: Priority;
  mine?: boolean;
  risky?: boolean;
  sort?: 'module' | 'due' | 'priority';
  page?: number;
  pageSize?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return translateCurrent('Something went wrong. Please try again.');
}

export function errorFields(error: unknown): Record<string, string> {
  return error instanceof ApiError && error.fields ? error.fields : {};
}

export const SESSION_EXPIRED_EVENT = 'ho:session-expired';
let csrfToken = '';

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  skipAuthEvent?: boolean;
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!isSafeMethod(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'network_error',
      translateCurrent('Network request failed. Check your connection and try again.'),
    );
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const body = payload as {
      error?: { code?: string; message?: string; fields?: Record<string, string> };
    } | null;
    const error = new ApiError(
      response.status,
      body?.error?.code ?? 'request_failed',
      body?.error?.message ??
        translateCurrent('Request failed ({{status}})', { status: response.status }),
      body?.error?.fields,
    );
    if (response.status === 401 && !options.skipAuthEvent) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw error;
  }

  return payload as T;
}

export async function fetchSession(): Promise<SessionInfo | null> {
  const response = await fetch('/api/auth/me', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      'session_failed',
      translateCurrent("Couldn't load your session"),
    );
  }
  const session = (await response.json()) as SessionInfo;
  setCsrfToken(session.csrfToken);
  return session;
}

function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : '';
}

async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`/api${path}`, {
    headers: { Accept: 'text/markdown' },
    credentials: 'same-origin',
  });
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    throw new ApiError(401, 'unauthorized', translateCurrent('Your session has expired'));
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      'download_failed',
      translateCurrent('Export failed. Please try again.'),
    );
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plainMatch = /filename="([^"]+)"/i.exec(disposition);
  const fileName = utfMatch?.[1]
    ? decodeURIComponent(utfMatch[1])
    : (plainMatch?.[1] ?? fallbackName);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export const api = {
  auth: {
    fetchSession,
    async login(input: LoginInput): Promise<SessionInfo> {
      const session = await apiRequest<SessionInfo>('/auth/login', {
        method: 'POST',
        body: input,
        skipAuthEvent: true,
      });
      setCsrfToken(session.csrfToken);
      return session;
    },
    async logout(): Promise<void> {
      try {
        await apiRequest<void>('/auth/logout', { method: 'POST' });
      } finally {
        setCsrfToken('');
      }
    },
    async register(input: RegisterInput): Promise<SessionInfo> {
      const session = await apiRequest<SessionInfo>('/auth/register', {
        method: 'POST',
        body: input,
        skipAuthEvent: true,
      });
      setCsrfToken(session.csrfToken);
      return session;
    },
    changePassword(input: ChangePasswordInput): Promise<{ ok: true }> {
      return apiRequest<{ ok: true }>('/auth/password', { method: 'POST', body: input });
    },
  },
  teams: {
    async list(): Promise<TeamSummary[]> {
      return (await apiRequest<{ teams: TeamSummary[] }>('/teams')).teams;
    },
    async create(input: CreateTeamInput): Promise<TeamDetail> {
      return (await apiRequest<{ team: TeamDetail }>('/teams', { method: 'POST', body: input }))
        .team;
    },
    async get(teamId: string): Promise<TeamDetail> {
      return (await apiRequest<{ team: TeamDetail }>(`/teams/${teamId}`)).team;
    },
    async join(code: string): Promise<{ team: TeamDetail; alreadyMember: boolean }> {
      return apiRequest<{ team: TeamDetail; alreadyMember: boolean }>('/teams/join', {
        method: 'POST',
        body: { code },
      });
    },
    async update(teamId: string, input: UpdateTeamInput): Promise<TeamDetail> {
      return (
        await apiRequest<{ team: TeamDetail }>(`/teams/${teamId}`, {
          method: 'PATCH',
          body: input,
        })
      ).team;
    },
    async rotateJoinCode(teamId: string): Promise<TeamDetail> {
      return (
        await apiRequest<{ team: TeamDetail }>(`/teams/${teamId}/join-code/rotate`, {
          method: 'POST',
        })
      ).team;
    },
    async addMember(teamId: string, input: AddTeamMemberInput): Promise<TeamDetail> {
      return (
        await apiRequest<{ team: TeamDetail }>(`/teams/${teamId}/members`, {
          method: 'POST',
          body: input,
        })
      ).team;
    },
    async removeMember(teamId: string, userId: string): Promise<TeamDetail> {
      return (
        await apiRequest<{ team: TeamDetail }>(`/teams/${teamId}/members/${userId}`, {
          method: 'DELETE',
        })
      ).team;
    },
    leave(teamId: string): Promise<void> {
      return apiRequest<void>(`/teams/${teamId}/leave`, { method: 'POST' });
    },
  },
  projects: {
    async list(): Promise<ProjectSummary[]> {
      return (await apiRequest<{ projects: ProjectSummary[] }>('/projects')).projects;
    },
    async create(input: CreateProjectInput): Promise<ProjectDetail> {
      return (
        await apiRequest<{ project: ProjectDetail }>('/projects', {
          method: 'POST',
          body: input,
        })
      ).project;
    },
    async get(projectId: string): Promise<ProjectDetail> {
      return (await apiRequest<{ project: ProjectDetail }>(`/projects/${projectId}`)).project;
    },
    async update(projectId: string, input: UpdateProjectInput): Promise<ProjectDetail> {
      return (
        await apiRequest<{ project: ProjectDetail }>(`/projects/${projectId}`, {
          method: 'PATCH',
          body: input,
        })
      ).project;
    },
    async stage(projectId: string, action: ProjectStageAction): Promise<ProjectDetail> {
      return (
        await apiRequest<{ project: ProjectDetail }>(`/projects/${projectId}/stage`, {
          method: 'POST',
          body: { action },
        })
      ).project;
    },
    async overview(projectId: string): Promise<Overview> {
      return (await apiRequest<{ overview: Overview }>(`/projects/${projectId}/overview`)).overview;
    },
    async members(projectId: string): Promise<ProjectMember[]> {
      return (await apiRequest<{ members: ProjectMember[] }>(`/projects/${projectId}/members`))
        .members;
    },
    async addMember(projectId: string, input: AddMemberInput): Promise<ProjectMember[]> {
      return (
        await apiRequest<{ members: ProjectMember[] }>(`/projects/${projectId}/members`, {
          method: 'POST',
          body: input,
        })
      ).members;
    },
    async removeMember(projectId: string, userId: string): Promise<ProjectMember[]> {
      return (
        await apiRequest<{ members: ProjectMember[] }>(`/projects/${projectId}/members/${userId}`, {
          method: 'DELETE',
        })
      ).members;
    },
    async memberCandidates(
      projectId: string,
      query: { q?: string; email?: string },
    ): Promise<UserRef[]> {
      return (
        await apiRequest<UserLookupResult>(
          `/projects/${projectId}/member-candidates${queryString(query)}`,
        )
      ).users;
    },
    async events(projectId: string, limit = 30): Promise<Event[]> {
      return (
        await apiRequest<{ events: Event[] }>(
          `/projects/${projectId}/events${queryString({ limit })}`,
        )
      ).events;
    },
  },
  items: {
    list(projectId: string, params: ItemsQueryParams = {}): Promise<ItemsPage> {
      return apiRequest<ItemsPage>(
        `/projects/${projectId}/items${queryString({
          ...params,
          mine: params.mine ? 'true' : undefined,
          risky: params.risky ? 'true' : undefined,
        })}`,
      );
    },
    create(projectId: string, input: CreateItemInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/projects/${projectId}/items`, {
        method: 'POST',
        body: input,
      });
    },
    get(itemId: string): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/items/${itemId}`);
    },
    update(itemId: string, input: UpdateItemInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/items/${itemId}`, { method: 'PATCH', body: input });
    },
    reviseRule(itemId: string, input: UpdateRuleInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/items/${itemId}/rule`, {
        method: 'POST',
        body: input,
      });
    },
    addEvidence(itemId: string, input: AddEvidenceInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/items/${itemId}/evidence`, {
        method: 'POST',
        body: input,
      });
    },
    review(itemId: string, input: ReviewInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/items/${itemId}/reviews`, {
        method: 'POST',
        body: input,
      });
    },
    accept(itemId: string, input: AcceptanceInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/items/${itemId}/acceptance`, {
        method: 'POST',
        body: input,
      });
    },
    addNote(itemId: string, input: CreateNoteInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/items/${itemId}/notes`, {
        method: 'POST',
        body: input,
      });
    },
    answerNote(noteId: string, input: AnswerNoteInput): Promise<ItemDetail> {
      return apiRequest<ItemDetail>(`/notes/${noteId}/answer`, {
        method: 'POST',
        body: input,
      });
    },
    async closeCondition(conditionId: string): Promise<Condition> {
      return (
        await apiRequest<{ condition: Condition }>(`/conditions/${conditionId}/close`, {
          method: 'POST',
        })
      ).condition;
    },
    async all(projectId: string): Promise<ItemSummary[]> {
      const page = await this.list(projectId, { pageSize: 200, sort: 'module' });
      return page.items;
    },
  },
  risks: {
    async list(projectId: string): Promise<Risk[]> {
      return (await apiRequest<{ risks: Risk[] }>(`/projects/${projectId}/risks`)).risks;
    },
    async create(projectId: string, input: CreateRiskInput): Promise<Risk> {
      return (
        await apiRequest<{ risk: Risk }>(`/projects/${projectId}/risks`, {
          method: 'POST',
          body: input,
        })
      ).risk;
    },
    async update(riskId: string, input: UpdateRiskInput): Promise<Risk> {
      return (
        await apiRequest<{ risk: Risk }>(`/risks/${riskId}`, {
          method: 'PATCH',
          body: input,
        })
      ).risk;
    },
    async transition(riskId: string, action: RiskAction, note = ''): Promise<Risk> {
      return (
        await apiRequest<{ risk: Risk }>(`/risks/${riskId}/transition`, {
          method: 'POST',
          body: { action, note },
        })
      ).risk;
    },
  },
  assets: {
    async list(projectId: string): Promise<Asset[]> {
      return (await apiRequest<{ assets: Asset[] }>(`/projects/${projectId}/assets`)).assets;
    },
    async create(projectId: string, input: CreateAssetInput): Promise<Asset> {
      return (
        await apiRequest<{ asset: Asset }>(`/projects/${projectId}/assets`, {
          method: 'POST',
          body: input,
        })
      ).asset;
    },
    async act(assetId: string, action: AssetAction['action']): Promise<Asset> {
      return (
        await apiRequest<{ asset: Asset }>(`/assets/${assetId}/action`, {
          method: 'POST',
          body: { action },
        })
      ).asset;
    },
  },
  steps: {
    async list(projectId: string): Promise<Step[]> {
      return (await apiRequest<{ steps: Step[] }>(`/projects/${projectId}/steps`)).steps;
    },
    async create(projectId: string, input: CreateStepInput): Promise<Step[]> {
      return (
        await apiRequest<{ steps: Step[] }>(`/projects/${projectId}/steps`, {
          method: 'POST',
          body: input,
        })
      ).steps;
    },
    async record(
      stepId: string,
      input: StepResultInput,
    ): Promise<{ step: Step; riskCode: string | null }> {
      return apiRequest<{ step: Step; riskCode: string | null }>(`/steps/${stepId}/result`, {
        method: 'POST',
        body: input,
      });
    },
    async updateScope(stepId: string, input: StepScopeInput): Promise<Step[]> {
      return (
        await apiRequest<{ steps: Step[] }>(`/steps/${stepId}`, {
          method: 'PATCH',
          body: input,
        })
      ).steps;
    },
  },
  chains: {
    async list(projectId: string): Promise<Chain[]> {
      return (await apiRequest<{ chains: Chain[] }>(`/projects/${projectId}/chains`)).chains;
    },
    async create(projectId: string, input: CreateChainInput): Promise<Chain[]> {
      return (
        await apiRequest<{ chains: Chain[] }>(`/projects/${projectId}/chains`, {
          method: 'POST',
          body: input,
        })
      ).chains;
    },
    async update(chainId: string, input: UpdateChainInput): Promise<Chain[]> {
      return (
        await apiRequest<{ chains: Chain[] }>(`/chains/${chainId}`, {
          method: 'PATCH',
          body: input,
        })
      ).chains;
    },
    async remove(chainId: string): Promise<Chain[]> {
      return (
        await apiRequest<{ chains: Chain[] }>(`/chains/${chainId}`, {
          method: 'DELETE',
        })
      ).chains;
    },
    async uploadScreenshot(chainId: string, blob: Blob): Promise<Chain[]> {
      const response = await fetch(`/api/chains/${chainId}/screenshot`, {
        method: 'PUT',
        headers: {
          'Content-Type': blob.type,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'same-origin',
        body: blob,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        throw new ApiError(
          response.status,
          body?.error?.code ?? 'request_failed',
          body?.error?.message ??
            translateCurrent('Screenshot upload failed ({{status}})', { status: response.status }),
        );
      }
      return (await response.json()).chains;
    },
    screenshotUrl(chainId: string): string {
      return `/api/chains/${chainId}/screenshot`;
    },
    async removeScreenshot(chainId: string): Promise<Chain[]> {
      return (
        await apiRequest<{ chains: Chain[] }>(`/chains/${chainId}/screenshot`, {
          method: 'DELETE',
        })
      ).chains;
    },
  },
  report: {
    async get(projectId: string): Promise<ReportData> {
      return (await apiRequest<{ report: ReportData }>(`/projects/${projectId}/report`)).report;
    },
    async conclude(projectId: string, input: ConclusionInput): Promise<ReportData> {
      return (
        await apiRequest<{ report: ReportData }>(`/projects/${projectId}/conclusion`, {
          method: 'POST',
          body: input,
        })
      ).report;
    },
    async sign(projectId: string, input: SignoffInput): Promise<ReportData> {
      return (
        await apiRequest<{ report: ReportData }>(`/projects/${projectId}/signoffs`, {
          method: 'POST',
          body: input,
        })
      ).report;
    },
    download(projectId: string, code: string): Promise<void> {
      return downloadFile(`/projects/${projectId}/report.md`, `delivery-report-${code}.md`);
    },
  },
  users: {
    async list(): Promise<AdminUser[]> {
      return (await apiRequest<{ users: AdminUser[] }>('/users')).users;
    },
    async create(input: CreateUserInput): Promise<AdminUser> {
      return (
        await apiRequest<{ user: AdminUser }>('/users', {
          method: 'POST',
          body: input,
        })
      ).user;
    },
    async update(userId: string, input: UpdateUserInput): Promise<AdminUser> {
      return (
        await apiRequest<{ user: AdminUser }>(`/users/${userId}`, {
          method: 'PATCH',
          body: input,
        })
      ).user;
    },
  },
};

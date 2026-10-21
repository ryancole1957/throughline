import type {
  AcceptanceDecision,
  AcceptanceStatus,
  AssetSensitivity,
  AssetStatus,
  ConditionSeverity,
  ConditionStatus,
  ConclusionDecision,
  EvidenceType,
  NoteKind,
  Priority,
  ProjectRole,
  ProjectStage,
  ProjectStatus,
  ReviewDecision,
  ReviewStage,
  RiskAction,
  RiskSeverity,
  RiskStatus,
  SignoffDecision,
  SignoffRole,
  StepStatus,
  SupplyStatus,
  SystemRole,
  TeamRole,
} from './domain';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
}

export interface UserRef {
  id: string;
  name: string;
  email: string;
  title: string;
}

export interface AuthUser extends UserRef {
  systemRole: SystemRole;
  createdAt: string;
}

export interface SessionInfo {
  user: AuthUser;
  csrfToken: string;
}

export interface AdminUser extends AuthUser {
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  projectCount: number;
}

export interface TeamSummary {
  id: string;
  name: string;
  role: TeamRole;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  title: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamDetail extends TeamSummary {
  joinCode: string;
  members: TeamMember[];
  projects: ProjectSummary[];
}

export interface ProjectStats {
  totalItems: number;
  submittedItems: number;
  settledItems: number;
  highRisks: number;
  openConditions: number;
  e2ePassed: number;
  e2eTotal: number;
  members: number;
}

export interface ProjectSummary {
  id: string;
  teamId: string;
  teamName: string;
  code: string;
  name: string;
  client: string;
  stage: ProjectStage;
  status: ProjectStatus;
  kickoff: string;
  deadline: string;
  scope: string;
  myRole: ProjectRole | null;
  isAdmin: boolean;
  stats: ProjectStats;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  stage: ProjectStage;
  plannedDate: string | null;
  completedAt: string | null;
}

export interface ProjectMember {
  userId: string;
  name: string;
  email: string;
  title: string;
  role: ProjectRole;
  joinedAt: string;
}

export interface Permissions {
  manageProject: boolean;
  manageMembers: boolean;
  createItem: boolean;
  submitEvidence: boolean;
  reviewCore: boolean;
  reviewBusiness: boolean;
  acceptItems: boolean;
  verifyAssets: boolean;
  rotateAssets: boolean;
  recordVerification: boolean;
  conclude: boolean;
  signOff: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMember[];
  milestones: Milestone[];
  permissions: Permissions;
  createdBy: UserRef;
}

export interface ItemRef {
  id: string;
  code: string;
  title: string;
}

export interface MappingRef {
  id: string;
  page: string;
  title: string;
}

export interface GateResult {
  ready: boolean;
  missing: string[];
}

export interface ReviewBrief {
  id: string;
  stage: ReviewStage;
  decision: ReviewDecision;
  author: UserRef;
  createdAt: string;
  revision: number;
  effective: boolean;
}

export interface ItemSummary {
  id: string;
  seq: number;
  code: string;
  module: string;
  title: string;
  scope: string;
  priority: Priority;
  dueDate: string;
  supplyStatus: SupplyStatus;
  acceptanceStatus: AcceptanceStatus;
  revision: number;
  coreRequired: boolean;
  businessRequired: boolean;
  evidenceCount: number;
  riskCodes: string[];
  gate: GateResult;
  latestCore: ReviewBrief | null;
  latestBusiness: ReviewBrief | null;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  environment: string;
  version: string;
  reference: string;
  description: string;
  author: UserRef;
  createdAt: string;
}

export interface Review {
  id: string;
  stage: ReviewStage;
  decision: ReviewDecision;
  remarks: string;
  environment: string;
  version: string;
  reference: string;
  revision: number;
  author: UserRef;
  createdAt: string;
  effective: boolean;
}

export interface Acceptance {
  id: string;
  decision: AcceptanceDecision;
  remarks: string;
  environment: string;
  version: string;
  reference: string;
  revision: number;
  reviewer: UserRef;
  createdAt: string;
  effective: boolean;
}

export interface Condition {
  id: string;
  code: string;
  description: string;
  owner: UserRef;
  dueDate: string;
  severity: ConditionSeverity;
  status: ConditionStatus;
  item: ItemRef;
  createdAt: string;
  closedAt: string | null;
  closedBy: UserRef | null;
}

export interface Note {
  id: string;
  kind: NoteKind;
  body: string;
  author: UserRef;
  assignee: UserRef | null;
  parentId: string | null;
  answeredAt: string | null;
  createdAt: string;
}

export interface Event {
  id: string;
  action: string;
  detail: string;
  actor: UserRef;
  item: ItemRef | null;
  createdAt: string;
}

export interface Risk {
  id: string;
  code: string;
  title: string;
  impact: string;
  mitigation: string;
  severity: RiskSeverity;
  status: RiskStatus;
  owner: UserRef;
  dueDate: string;
  progress: string;
  items: ItemRef[];
  exceptionNote: string;
  exceptionBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  type: string;
  sensitivity: AssetSensitivity;
  reference: string;
  custodian: string;
  status: AssetStatus;
  verifiedAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface MappingEndpoint {
  method: string;
  path: string;
  note: string;
}

export interface Chain {
  id: string;
  name: string;
  title: string;
  page: string;
  url: string;
  endpoints: MappingEndpoint[];
  service: string;
  tables: string;
  environment: string;
  ownerName: string;
  hasScreenshot: boolean;
}

export interface Step {
  id: string;
  position: number;
  name: string;
  status: StepStatus;
  note: string;
  environment: string;
  recordedBy: UserRef | null;
  recordedAt: string | null;
  items: ItemRef[];
  mappings: MappingRef[];
  stale: boolean;
}

export interface ItemPermissions {
  submitEvidence: boolean;
  reviewCore: boolean;
  reviewBusiness: boolean;
  accept: boolean;
  editRule: boolean;
  manageItem: boolean;
}

export interface ItemDetail {
  item: ItemSummary & {
    rule: string;
    createdBy: UserRef;
  };
  evidence: Evidence[];
  reviews: Review[];
  acceptances: Acceptance[];
  conditions: Condition[];
  notes: Note[];
  risks: Risk[];
  assets: Asset[];
  events: Event[];
  gate: GateResult;
  permissions: ItemPermissions;
}

export interface ItemsPage {
  items: ItemSummary[];
  total: number;
  page: number;
  pageSize: number;
  modules: string[];
}

export interface ModuleStat {
  module: string;
  total: number;
  submitted: number;
  settled: number;
  highRisks: number;
}

export interface GapSet {
  delivery: { count: number; items: ItemRef[] };
  review: { count: number; items: ItemRef[] };
  acceptance: { count: number; items: ItemRef[] };
}

export type TodoKind =
  | 'submit_evidence'
  | 'supplement'
  | 'core_review'
  | 'business_review'
  | 'acceptance'
  | 'answer_question'
  | 'condition'
  | 'risk_owner'
  | 'risk_decision'
  | 'asset_verification'
  | 'asset_rotation'
  | 'signoff'
  | 'conclusion';

export interface Todo {
  id: string;
  kind: TodoKind;
  title: string;
  meta: string;
  dueDate?: string;
  itemId?: string;
  itemCode?: string;
  riskId?: string;
  riskCode?: string;
  assetId?: string;
  assetCode?: string;
}

export interface Overview {
  stats: ProjectStats;
  modules: ModuleStat[];
  gaps: GapSet;
  todos: Todo[];
  highRisks: Risk[];
  recentEvents: Event[];
  steps: Step[];
}

export interface ReportModuleTotal {
  items: number;
  submitted: number;
  settled: number;
  highRisks: number;
}

export interface ReportDifference {
  item: ItemRef;
  acceptanceStatus: AcceptanceStatus;
  reason: string;
  environment: string;
  version: string;
  reference: string;
  decidedBy: string;
  decidedAt: string;
}

export interface ReportSignoff {
  role: SignoffRole;
  member: UserRef | null;
  decision: SignoffDecision | null;
  note: string;
  signedAt: string | null;
  snapshotHash: string | null;
  hashState: 'current' | 'stale' | null;
}

export interface Conclusion {
  decision: ConclusionDecision;
  note: string;
  decidedBy: UserRef;
  decidedAt: string;
}

export interface ReportData {
  project: ProjectDetail;
  generatedAt: string;
  moduleTable: ModuleStat[];
  totals: ReportModuleTotal;
  differences: ReportDifference[];
  conditions: Condition[];
  openRisks: Risk[];
  scope: string;
  e2e: { passed: number; total: number };
  conclusion: Conclusion | null;
  signoffs: ReportSignoff[];
  currentSnapshotHash: string;
  signoffRole: SignoffRole | null;
  canSignOff: boolean;
}

export interface UserLookupResult {
  users: UserRef[];
}

export interface DeleteResult {
  ok: true;
}

export interface ProjectStageResult {
  project: ProjectDetail;
}

export interface AssetAction {
  action: 'verify' | 'rotate';
}

export interface RiskTransition {
  action: RiskAction;
  note: string;
}

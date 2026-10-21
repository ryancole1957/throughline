import type {
  Permissions,
  ProjectRole,
  ProjectStage,
  ProjectStatus,
  SignoffRole,
  SystemRole,
  TeamRole,
} from '@throughline/shared';
import { SIGNOFF_ROLES } from '@throughline/shared';

import { conflict } from '../lib/errors';

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  title: string;
  password_hash: string;
  system_role: SystemRole;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface ProjectRecord {
  id: string;
  team_id: string;
  code: string;
  name: string;
  client: string;
  stage: ProjectStage;
  status: ProjectStatus;
  scope: string;
  kickoff: string;
  deadline: string;
  created_by: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRecord {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
}

export interface ProjectAccess {
  project: ProjectRecord;
  role: ProjectRole | null;
  teamRole: TeamRole | null;
  isAdmin: boolean;
  permissions: Permissions;
}

export function computePermissions(role: ProjectRole | null, isAdmin: boolean): Permissions {
  const isReceiver = role === 'receiver';
  const signoffRole = role !== null && (SIGNOFF_ROLES as readonly string[]).includes(role);
  return {
    manageProject: isAdmin || isReceiver,
    manageMembers: isAdmin || isReceiver,
    createItem: isAdmin || isReceiver,
    submitEvidence: role === 'delivery',
    reviewCore: role === 'core_reviewer',
    reviewBusiness: role === 'business_reviewer',
    acceptItems: isReceiver,
    verifyAssets: isReceiver,
    rotateAssets: isAdmin,
    recordVerification: isReceiver,
    conclude: isReceiver,
    signOff: signoffRole,
  };
}

export function signoffRoleFor(role: ProjectRole | null): SignoffRole | null {
  if (!role) return null;
  return (SIGNOFF_ROLES as readonly string[]).includes(role) ? (role as SignoffRole) : null;
}

export function assertProjectWritable(access: ProjectAccess): void {
  if (access.project.stage === 'closed') throw conflict('The project is closed and cannot be modified');
  if (access.project.status === 'paused') throw conflict('The project is paused and cannot be modified');
}

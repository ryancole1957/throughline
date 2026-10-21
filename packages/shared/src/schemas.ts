import { z } from 'zod';

import {
  ACCEPTANCE_DECISIONS,
  ASSET_SENSITIVITIES,
  CONDITION_SEVERITIES,
  CONCLUSION_DECISIONS,
  EVIDENCE_TYPES,
  HTTP_METHODS,
  PRIORITIES,
  PROJECT_ROLES,
  PROJECT_STAGE_ACTIONS,
  REVIEW_STAGES,
  RISK_ACTIONS,
  RISK_SEVERITIES,
  SIGNOFF_DECISIONS,
  STEP_STATUSES,
  SYSTEM_ROLES,
  TEAM_ROLES,
} from './domain';

const trimmedString = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalTrimmed = (max: number) => z.string().trim().max(max).optional().default('');
const optionalText = (max: number) => z.string().trim().max(max).optional();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD');
const email = trimmedString(3, 320)
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());
const password = z.string().min(12, 'Password must be at least 12 characters').max(200);

export const loginSchema = z.object({
  identifier: trimmedString(1, 320),
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: trimmedString(1, 80),
    email,
    title: optionalTrimmed(120),
    password,
    inviteCode: optionalTrimmed(40),
  })
  .strict();

export const createTeamSchema = z
  .object({
    name: trimmedString(2, 80),
  })
  .strict();

export const updateTeamSchema = z
  .object({
    name: trimmedString(2, 80).optional(),
  })
  .strict();

export const joinTeamSchema = z
  .object({
    code: trimmedString(4, 40).transform((value) => value.trim().toUpperCase()),
  })
  .strict();

export const addTeamMemberSchema = z
  .object({
    email,
    role: z.enum(TEAM_ROLES).optional().default('member'),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: password,
  })
  .strict();

export const createUserSchema = z
  .object({
    name: trimmedString(1, 80),
    email,
    title: optionalTrimmed(120),
    password,
    systemRole: z.enum(SYSTEM_ROLES).optional().default('member'),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: trimmedString(1, 80).optional(),
    title: optionalText(120),
    systemRole: z.enum(SYSTEM_ROLES).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    password: password.optional(),
  })
  .strict();

export const createProjectSchema = z
  .object({
    teamId: z.string().uuid('Select a valid team'),
    code: trimmedString(3, 40).regex(
      /^[A-Z0-9][A-Z0-9-]*$/,
      'Code may only contain uppercase letters, digits, and hyphens',
    ),
    name: trimmedString(2, 160),
    client: optionalTrimmed(120),
    kickoff: dateString,
    deadline: dateString,
    scope: optionalTrimmed(4000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.deadline < value.kickoff) {
      ctx.addIssue({
        code: 'custom',
        path: ['deadline'],
        message: 'Deadline cannot be earlier than the kickoff date',
      });
    }
  });

export const updateProjectSchema = z
  .object({
    name: trimmedString(2, 160).optional(),
    client: optionalText(120),
    scope: optionalText(4000),
    deadline: dateString.optional(),
  })
  .strict();

export const projectStageActionSchema = z
  .object({
    action: z.enum(PROJECT_STAGE_ACTIONS),
  })
  .strict();

export const addMemberSchema = z
  .object({
    email,
    role: z.enum(PROJECT_ROLES),
  })
  .strict();

export const createItemSchema = z
  .object({
    module: trimmedString(1, 80),
    title: trimmedString(2, 240),
    scope: optionalTrimmed(2000),
    priority: z.enum(PRIORITIES).default('medium'),
    dueDate: dateString,
    rule: trimmedString(5, 4000),
    coreRequired: z.boolean().default(true),
    businessRequired: z.boolean().default(false),
  })
  .strict();

export const updateItemSchema = z
  .object({
    module: trimmedString(1, 80).optional(),
    title: trimmedString(2, 240).optional(),
    scope: optionalText(2000),
    priority: z.enum(PRIORITIES).optional(),
    dueDate: dateString.optional(),
    coreRequired: z.boolean().optional(),
    businessRequired: z.boolean().optional(),
  })
  .strict();

export const updateRuleSchema = z
  .object({
    rule: trimmedString(5, 4000),
  })
  .strict();

export const addEvidenceSchema = z
  .object({
    type: z.enum(EVIDENCE_TYPES),
    environment: optionalTrimmed(120),
    version: optionalTrimmed(80),
    reference: optionalTrimmed(300),
    description: trimmedString(2, 2000),
  })
  .strict();

export const reviewSchema = z
  .object({
    stage: z.enum(REVIEW_STAGES),
    decision: z.enum(['passed', 'confirmed', 'returned', 'failed']),
    remarks: optionalTrimmed(2000),
    environment: optionalTrimmed(120),
    version: optionalTrimmed(80),
    reference: optionalTrimmed(300),
  })
  .strict();

export const acceptanceSchema = z
  .object({
    decision: z.enum(ACCEPTANCE_DECISIONS),
    remarks: optionalTrimmed(2000),
    environment: optionalTrimmed(120),
    version: optionalTrimmed(80),
    reference: optionalTrimmed(300),
    condition: z
      .object({
        description: trimmedString(5, 2000),
        ownerId: z.string().uuid(),
        dueDate: dateString,
        severity: z.enum(CONDITION_SEVERITIES),
      })
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'conditional' && !value.condition) {
      ctx.addIssue({
        code: 'custom',
        path: ['condition'],
        message: 'Conditional acceptance requires an owner, due date, and severity',
      });
    }
    if (['passed', 'conditional', 'rejected'].includes(value.decision)) {
      if (!value.environment) {
        ctx.addIssue({ code: 'custom', path: ['environment'], message: 'Enter the environment' });
      }
      if (!value.version) {
        ctx.addIssue({ code: 'custom', path: ['version'], message: 'Enter the verified version' });
      }
    }
  });

export const createNoteSchema = z
  .object({
    body: trimmedString(1, 4000),
    isQuestion: z.boolean().default(false),
    assigneeId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isQuestion && !value.assigneeId) {
      ctx.addIssue({
        code: 'custom',
        path: ['assigneeId'],
        message: 'Select who should answer the question',
      });
    }
  });

export const answerNoteSchema = z
  .object({
    body: trimmedString(1, 4000),
  })
  .strict();

export const createRiskSchema = z
  .object({
    title: trimmedString(3, 240),
    impact: optionalTrimmed(2000),
    mitigation: optionalTrimmed(2000),
    severity: z.enum(RISK_SEVERITIES).default('medium'),
    ownerId: z.string().uuid(),
    dueDate: dateString,
    itemIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export const updateRiskSchema = z
  .object({
    title: trimmedString(3, 240).optional(),
    impact: optionalText(2000),
    mitigation: optionalText(2000),
    progress: optionalText(2000),
    severity: z.enum(RISK_SEVERITIES).optional(),
    ownerId: z.string().uuid().optional(),
    dueDate: dateString.optional(),
  })
  .strict();

export const riskTransitionSchema = z
  .object({
    action: z.enum(RISK_ACTIONS),
    note: optionalTrimmed(2000),
  })
  .strict();

export const createConditionSchema = z
  .object({
    description: trimmedString(5, 2000),
    ownerId: z.string().uuid(),
    dueDate: dateString,
    severity: z.enum(CONDITION_SEVERITIES),
  })
  .strict();

export const createAssetSchema = z
  .object({
    name: trimmedString(2, 160),
    type: trimmedString(1, 60),
    sensitivity: z.enum(ASSET_SENSITIVITIES).default('internal'),
    reference: optionalTrimmed(300),
    custodian: trimmedString(1, 120),
    note: optionalTrimmed(2000),
  })
  .strict();

export const assetActionSchema = z
  .object({
    action: z.enum(['verify', 'rotate']),
  })
  .strict();

export const stepFailureRiskSchema = z
  .object({
    severity: z.enum(RISK_SEVERITIES).default('medium'),
    ownerId: z.string().uuid(),
    dueDate: dateString,
    title: optionalTrimmed(240),
  })
  .strict();

export const stepResultSchema = z
  .object({
    status: z.enum(STEP_STATUSES),
    note: trimmedString(2, 2000),
    environment: optionalTrimmed(120),
    risk: stepFailureRiskSchema.optional(),
  })
  .strict();

export const stepScopeSchema = z
  .object({
    itemIds: z.array(z.string().uuid()).max(50).default([]),
    chainIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export const createStepSchema = z
  .object({
    name: trimmedString(2, 200),
  })
  .strict();

export const endpointSchema = z
  .object({
    method: z.enum(HTTP_METHODS).optional().default('GET'),
    path: trimmedString(1, 300),
    note: optionalTrimmed(200),
  })
  .strict();

export const createChainSchema = z
  .object({
    title: optionalTrimmed(200),
    page: trimmedString(1, 200),
    url: optionalTrimmed(500),
    endpoints: z.array(endpointSchema).min(1, 'Add at least one API endpoint').max(40),
    service: optionalTrimmed(200),
    tables: optionalTrimmed(300),
    environment: optionalTrimmed(120),
    ownerName: optionalTrimmed(120),
  })
  .strict();

export const updateChainSchema = z
  .object({
    title: optionalText(200),
    page: trimmedString(1, 200).optional(),
    url: optionalText(500),
    endpoints: z.array(endpointSchema).min(1).max(40).optional(),
    service: optionalText(200),
    tables: optionalText(300),
    environment: optionalText(120),
    ownerName: optionalText(120),
  })
  .strict();

export const conclusionSchema = z
  .object({
    decision: z.enum(CONCLUSION_DECISIONS),
    note: optionalTrimmed(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision !== 'accepted' && !value.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'A note is required for conditional acceptance or non-acceptance',
      });
    }
  });

export const signoffSchema = z
  .object({
    decision: z.enum(SIGNOFF_DECISIONS),
    note: optionalTrimmed(2000),
  })
  .strict();

export const itemsQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  module: z.string().trim().max(80).optional(),
  supply: z.enum(['pending_submission', 'submitted', 'needs_information']).optional(),
  acceptance: z
    .enum([
      'pending_review',
      'in_verification',
      'passed',
      'conditional',
      'rejected',
      'not_applicable',
    ])
    .optional(),
  priority: z.enum(PRIORITIES).optional(),
  mine: z.enum(['true', 'false']).optional().default('false'),
  risky: z.enum(['true', 'false']).optional().default('false'),
  sort: z.enum(['module', 'due', 'priority']).optional().default('module'),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});
export type ItemsQueryInput = z.infer<typeof itemsQuerySchema>;

export const userLookupSchema = z.object({
  email: z.string().trim().max(320).optional(),
  q: z.string().trim().max(120).optional(),
});

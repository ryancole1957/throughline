export const initialMigration = {
  version: 1,
  name: 'initial_schema',
  sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  system_role TEXT NOT NULL DEFAULT 'member' CHECK (system_role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
) STRICT;

CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data TEXT NOT NULL
) STRICT;

CREATE INDEX idx_sessions_expires ON sessions (expires);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  join_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_teams_created_by ON teams (created_by);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
) STRICT;

CREATE UNIQUE INDEX idx_team_members_single_owner
  ON team_members (team_id)
  WHERE role = 'owner';

CREATE INDEX idx_team_members_user ON team_members (user_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL CHECK (
    stage IN ('draft', 'scope', 'collection', 'walkthrough', 'verification', 'signoff', 'closed')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  scope TEXT NOT NULL DEFAULT '',
  kickoff TEXT NOT NULL,
  deadline TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_projects_stage ON projects (stage, status);
CREATE INDEX idx_projects_team ON projects (team_id, stage);

CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (
    role IN ('receiver', 'delivery', 'core_reviewer', 'business_reviewer', 'observer')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
) STRICT;

CREATE UNIQUE INDEX idx_project_members_single_accountable_role
  ON project_members (project_id, role)
  WHERE role <> 'observer';

CREATE INDEX idx_project_members_user ON project_members (user_id);

CREATE TABLE project_milestones (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (
    stage IN ('draft', 'scope', 'collection', 'walkthrough', 'verification', 'signoff', 'closed')
  ),
  planned_date TEXT,
  completed_at TEXT,
  PRIMARY KEY (project_id, stage)
) STRICT;

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  code TEXT NOT NULL,
  module TEXT NOT NULL,
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  due_date TEXT NOT NULL,
  supply_status TEXT NOT NULL CHECK (
    supply_status IN ('pending_submission', 'submitted', 'needs_information')
  ),
  acceptance_status TEXT NOT NULL CHECK (
    acceptance_status IN (
      'pending_review', 'in_verification', 'passed', 'conditional', 'rejected', 'not_applicable'
    )
  ),
  rule TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  core_required INTEGER NOT NULL DEFAULT 1 CHECK (core_required IN (0, 1)),
  business_required INTEGER NOT NULL DEFAULT 0 CHECK (business_required IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, seq),
  UNIQUE (project_id, code)
) STRICT;

CREATE INDEX idx_items_project_module ON items (project_id, module);
CREATE INDEX idx_items_project_acceptance ON items (project_id, acceptance_status);
CREATE INDEX idx_items_project_due ON items (project_id, due_date);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (
    type IN (
      'document', 'interface', 'test_record', 'demo_recording', 'configuration', 'meeting_minutes', 'other'
    )
  ),
  environment TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_evidence_item ON evidence (item_id, created_at);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (stage IN ('core', 'business')),
  decision TEXT NOT NULL CHECK (decision IN ('passed', 'confirmed', 'returned', 'failed')),
  remarks TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_reviews_item_stage ON reviews (item_id, stage, revision, created_at);

CREATE TABLE acceptances (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('passed', 'conditional', 'rejected', 'not_applicable')),
  remarks TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_acceptances_item ON acceptances (item_id, created_at);

CREATE TABLE conditions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  acceptance_id TEXT REFERENCES acceptances (id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  due_date TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  UNIQUE (project_id, code)
) STRICT;

CREATE INDEX idx_conditions_project_status ON conditions (project_id, status);
CREATE INDEX idx_conditions_owner ON conditions (owner_id, status);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'question', 'answer')),
  body TEXT NOT NULL,
  assignee_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES notes (id) ON DELETE CASCADE,
  answered_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_notes_item ON notes (item_id, created_at);
CREATE INDEX idx_notes_assignee ON notes (assignee_id, answered_at);

CREATE TABLE risks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  impact TEXT NOT NULL DEFAULT '',
  mitigation TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'escalated', 'mitigated', 'closed')),
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  due_date TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '',
  exception_note TEXT NOT NULL DEFAULT '',
  exception_by TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  UNIQUE (project_id, code)
) STRICT;

CREATE INDEX idx_risks_project_status ON risks (project_id, status, severity);
CREATE INDEX idx_risks_owner ON risks (owner_id, status);

CREATE TABLE risk_items (
  risk_id TEXT NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  PRIMARY KEY (risk_id, item_id)
) STRICT;

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('internal', 'sensitive', 'confidential')),
  reference TEXT NOT NULL DEFAULT '',
  custodian TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_verification', 'verified', 'pending_rotation')),
  verified_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, code)
) STRICT;

CREATE INDEX idx_assets_project ON assets (project_id, status);

CREATE TABLE item_assets (
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, asset_id)
) STRICT;

CREATE TABLE chains (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  api TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  tables TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_chains_project ON chains (project_id);

CREATE TABLE e2e_steps (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'passed', 'failed')),
  note TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  recorded_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  recorded_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, position)
) STRICT;

CREATE INDEX idx_e2e_steps_project ON e2e_steps (project_id, position);

CREATE TABLE e2e_step_items (
  step_id TEXT NOT NULL REFERENCES e2e_steps (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  PRIMARY KEY (step_id, item_id)
) STRICT;

CREATE TABLE conclusions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'conditionally_accepted', 'not_accepted')),
  note TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decided_at TEXT NOT NULL,
  voided_at TEXT
) STRICT;

CREATE INDEX idx_conclusions_project_active ON conclusions (project_id, voided_at);

CREATE TABLE signoffs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (
    role IN ('delivery', 'core_reviewer', 'business_reviewer', 'receiver')
  ),
  decision TEXT NOT NULL CHECK (decision IN ('agree', 'agree_with_reservations', 'disagree')),
  note TEXT NOT NULL DEFAULT '',
  snapshot_hash TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  voided_at TEXT
) STRICT;

CREATE UNIQUE INDEX idx_signoffs_active_role
  ON signoffs (project_id, role)
  WHERE voided_at IS NULL;
CREATE UNIQUE INDEX idx_signoffs_active_user
  ON signoffs (project_id, user_id)
  WHERE voided_at IS NULL;
CREATE INDEX idx_signoffs_project ON signoffs (project_id, signed_at);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  item_id TEXT REFERENCES items (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_events_project ON events (project_id, created_at DESC);
CREATE INDEX idx_events_item ON events (item_id, created_at DESC);
`,
};

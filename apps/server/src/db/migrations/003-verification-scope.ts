import type { Migration } from './index';

export const verificationScopeMigration: Migration = {
  version: 3,
  name: 'verification-scope',
  sql: `
ALTER TABLE chains ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE chains SET updated_at = created_at WHERE updated_at = '';

ALTER TABLE e2e_steps ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';

CREATE TABLE e2e_step_chains (
  step_id TEXT NOT NULL REFERENCES e2e_steps (id) ON DELETE CASCADE,
  chain_id TEXT NOT NULL REFERENCES chains (id) ON DELETE CASCADE,
  PRIMARY KEY (step_id, chain_id)
) STRICT;

CREATE INDEX idx_e2e_step_chains_step ON e2e_step_chains (step_id);
  `,
};

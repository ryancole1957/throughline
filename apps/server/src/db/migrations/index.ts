import { initialMigration } from './001-initial';
import { pageMappingsMigration } from './002-page-mappings';
import { verificationScopeMigration } from './003-verification-scope';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: ReadonlyArray<Migration> = [
  initialMigration,
  pageMappingsMigration,
  verificationScopeMigration,
];

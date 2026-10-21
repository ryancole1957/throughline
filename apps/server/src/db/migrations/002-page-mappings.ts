import type { Migration } from './index';

export const pageMappingsMigration: Migration = {
  version: 2,
  name: 'page-mappings',
  sql: `
ALTER TABLE chains ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE chains ADD COLUMN url TEXT NOT NULL DEFAULT '';
ALTER TABLE chains ADD COLUMN endpoints TEXT NOT NULL DEFAULT '[]';
ALTER TABLE chains ADD COLUMN screenshot BLOB;
ALTER TABLE chains ADD COLUMN screenshot_type TEXT NOT NULL DEFAULT '';

UPDATE chains SET endpoints = CASE
  WHEN api = '' THEN '[]'
  WHEN instr(api, ' ') > 0
    AND upper(substr(api, 1, instr(api, ' ') - 1)) IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
    THEN json_array(json_object(
      'method', upper(substr(api, 1, instr(api, ' ') - 1)),
      'path', trim(substr(api, instr(api, ' ') + 1)),
      'note', ''))
  ELSE json_array(json_object('method', '', 'path', api, 'note', ''))
END
WHERE endpoints = '[]' AND api <> '';
  `,
};

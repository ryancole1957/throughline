import type { Chain, MappingEndpoint } from '@throughline/shared';

import type { AppDatabase } from '../db';

interface ChainListRow {
  id: string;
  name: string;
  title: string;
  page: string;
  url: string;
  endpoints: string;
  service: string;
  tables: string;
  environment: string;
  ownerName: string;
  hasScreenshot: number;
}

export interface ChainRecord {
  id: string;
  project_id: string;
  name: string;
  title: string;
  page: string;
  url: string;
  endpoints: string;
  service: string;
  tables: string;
  environment: string;
  owner_name: string;
  created_at: string;
}

function parseEndpoints(raw: string): MappingEndpoint[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.map((entry) => {
      const item = entry as Partial<MappingEndpoint>;
      return {
        method: typeof item.method === 'string' ? item.method : '',
        path: typeof item.path === 'string' ? item.path : '',
        note: typeof item.note === 'string' ? item.note : '',
      };
    });
  } catch {
    return [];
  }
}

export function listChains(db: AppDatabase, projectId: string): Chain[] {
  const rows = db
    .prepare(`
      SELECT id, name, title, page, url, endpoints, service, tables, environment,
             owner_name AS ownerName, (screenshot IS NOT NULL) AS hasScreenshot
      FROM chains WHERE project_id = ? ORDER BY rowid ASC
    `)
    .all(projectId) as ChainListRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    title: row.title,
    page: row.page,
    url: row.url,
    endpoints: parseEndpoints(row.endpoints),
    service: row.service,
    tables: row.tables,
    environment: row.environment,
    ownerName: row.ownerName,
    hasScreenshot: Boolean(row.hasScreenshot),
  }));
}

export function getChainRow(db: AppDatabase, chainId: string): ChainRecord | undefined {
  return db.prepare('SELECT * FROM chains WHERE id = ?').get(chainId) as
    | ChainRecord
    | undefined;
}

export interface ChainScreenshot {
  data: Uint8Array;
  type: string;
}

export function getChainScreenshot(
  db: AppDatabase,
  chainId: string,
): ChainScreenshot | undefined {
  const row = db
    .prepare('SELECT screenshot, screenshot_type AS type FROM chains WHERE id = ?')
    .get(chainId) as { screenshot: Uint8Array | null; type: string } | undefined;
  if (!row || !row.screenshot) return undefined;
  return { data: row.screenshot, type: row.type || 'application/octet-stream' };
}

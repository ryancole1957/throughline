import type { Asset, AssetSensitivity, AssetStatus } from '@throughline/shared';

import type { AppDatabase } from '../db';

export interface AssetRow {
  id: string;
  project_id: string;
  code: string;
  name: string;
  type: string;
  sensitivity: AssetSensitivity;
  reference: string;
  custodian: string;
  status: AssetStatus;
  verified_at: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

function mapAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    sensitivity: row.sensitivity,
    reference: row.reference,
    custodian: row.custodian,
    status: row.status,
    verifiedAt: row.verified_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listAssets(db: AppDatabase, projectId: string): Asset[] {
  const rows = db
    .prepare(`
      SELECT * FROM assets WHERE project_id = ?
      ORDER BY CASE status WHEN 'pending_rotation' THEN 0 WHEN 'pending_verification' THEN 1 ELSE 2 END,
               code
    `)
    .all(projectId) as AssetRow[];
  return rows.map(mapAsset);
}

export function getAssetRow(db: AppDatabase, id: string): AssetRow | undefined {
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
}

export function getAsset(db: AppDatabase, id: string): Asset | undefined {
  const row = getAssetRow(db, id);
  return row ? mapAsset(row) : undefined;
}

export function listAssetsForItem(
  db: AppDatabase,
  projectId: string,
  itemId: string,
): Asset[] {
  const rows = db
    .prepare(`
      SELECT a.* FROM item_assets ia
      JOIN assets a ON a.id = ia.asset_id
      WHERE ia.item_id = ? AND a.project_id = ?
      ORDER BY a.code
    `)
    .all(itemId, projectId) as AssetRow[];
  return rows.map(mapAsset);
}

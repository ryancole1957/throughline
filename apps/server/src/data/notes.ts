import type { Note, NoteKind } from '@throughline/shared';

import type { AppDatabase } from '../db';

export interface NoteRow {
  id: string;
  item_id: string;
  author_id: string;
  kind: NoteKind;
  body: string;
  assignee_id: string | null;
  parent_id: string | null;
  answered_at: string | null;
  created_at: string;
}

interface NoteListRow extends NoteRow {
  authorName: string;
  authorEmail: string;
  authorTitle: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeTitle: string | null;
  itemCode: string;
  itemTitle: string;
}

export interface NoteWithItem {
  note: Note;
  item: { id: string; code: string; title: string };
}

function mapNote(row: NoteListRow): Note {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    author: {
      id: row.author_id,
      name: row.authorName,
      email: row.authorEmail,
      title: row.authorTitle,
    },
    assignee:
      row.assignee_id && row.assigneeName && row.assigneeEmail && row.assigneeTitle
        ? {
            id: row.assignee_id,
            name: row.assigneeName,
            email: row.assigneeEmail,
            title: row.assigneeTitle,
          }
        : null,
    parentId: row.parent_id,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
  };
}

const noteSelect = `
  SELECT n.*, a.name AS authorName, a.email AS authorEmail, a.title AS authorTitle,
         s.name AS assigneeName, s.email AS assigneeEmail, s.title AS assigneeTitle,
         i.code AS itemCode, i.title AS itemTitle
  FROM notes n
  JOIN users a ON a.id = n.author_id
  LEFT JOIN users s ON s.id = n.assignee_id
  JOIN items i ON i.id = n.item_id
`;

export function listNotesForItem(db: AppDatabase, itemId: string): Note[] {
  const rows = db
    .prepare(`${noteSelect} WHERE n.item_id = ? ORDER BY n.created_at ASC, n.rowid ASC`)
    .all(itemId) as NoteListRow[];
  return rows.map(mapNote);
}

export function getNoteRow(db: AppDatabase, id: string): NoteRow | undefined {
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
}

export function listOpenQuestionsForUser(
  db: AppDatabase,
  projectId: string,
  userId: string,
): NoteWithItem[] {
  const rows = db
    .prepare(`
      ${noteSelect}
      WHERE i.project_id = ? AND n.kind = 'question' AND n.answered_at IS NULL
        AND n.assignee_id = ?
      ORDER BY n.created_at ASC
    `)
    .all(projectId, userId) as NoteListRow[];
  return rows.map((row) => ({
    note: mapNote(row),
    item: { id: row.item_id, code: row.itemCode, title: row.itemTitle },
  }));
}

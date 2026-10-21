import { openDatabase } from '../apps/server/src/db';
import { migrate } from '../apps/server/src/db/migrate';
import { seedSampleDataset } from '../apps/server/test/fixtures/sample-dataset';

const file = process.argv[2] ?? '/tmp/throughline-preview.db';
const password = process.argv[3] ?? 'Preview-Password!2026';

const db = openDatabase({ filename: file });
migrate(db);
const result = await seedSampleDataset(db, { password });
console.log(JSON.stringify({ file, projectId: result.projectId, teamId: result.teamId }));
db.close();

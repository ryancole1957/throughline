import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import common from '../apps/web/src/lib/i18n/zh/common';
import labels from '../apps/web/src/lib/i18n/zh/labels';
import auth from '../apps/web/src/lib/i18n/zh/auth';
import projects from '../apps/web/src/lib/i18n/zh/projects';
import dashboard from '../apps/web/src/lib/i18n/zh/dashboard';
import items from '../apps/web/src/lib/i18n/zh/items';
import verification from '../apps/web/src/lib/i18n/zh/verification';
import risks from '../apps/web/src/lib/i18n/zh/risks';
import report from '../apps/web/src/lib/i18n/zh/report';
import settings from '../apps/web/src/lib/i18n/zh/settings';
import teams from '../apps/web/src/lib/i18n/zh/teams';
import app from '../apps/web/src/lib/i18n/zh/app';
import ja from '../apps/web/src/lib/i18n/locales/ja';
import es from '../apps/web/src/lib/i18n/locales/es';
import fr from '../apps/web/src/lib/i18n/locales/fr';
import de from '../apps/web/src/lib/i18n/locales/de';

const zh: Record<string, string> = {
  ...common,
  ...labels,
  ...auth,
  ...projects,
  ...dashboard,
  ...items,
  ...verification,
  ...risks,
  ...report,
  ...settings,
  ...teams,
  ...app,
};

const dicts: Record<string, Record<string, string>> = { zh, ja, es, fr, de };
const refKeys = Object.keys(zh);
const ph = (s: string) => (s.match(/\{\{(\w+)\}\}/g) || []).sort().join(',');

let issues = 0;
for (const [name, d] of Object.entries(dicts)) {
  const keys = Object.keys(d);
  const missing = refKeys.filter((k) => !(k in d));
  const extra = keys.filter((k) => !refKeys.includes(k));
  if (missing.length) {
    console.log(`${name}: MISSING ${missing.length}`, missing.slice(0, 30));
    issues += missing.length;
  }
  if (extra.length) {
    console.log(`${name}: EXTRA ${extra.length}`, extra.slice(0, 30));
    issues += extra.length;
  }
  for (const k of keys) {
    if (refKeys.includes(k) && ph(zh[k]) !== ph(d[k])) {
      console.log(`${name}: placeholder mismatch "${k}" zh=[${ph(zh[k])}] x=[${ph(d[k])}]`);
      issues++;
    }
  }
  console.log(`${name}: ${keys.length} keys`);
}
const used = new Set<string>();
function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'i18n') walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const source = readFileSync(full, 'utf8');
    for (const match of source.matchAll(/(?<![A-Za-z0-9_])t(?:ranslateCurrent)?\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      used.add((match[1] ?? '').replace(/\\'/g, "'"));
    }
  }
}
walk(resolve(import.meta.dirname, '../apps/web/src'));

const untranslated = [...used].filter((key) => !(key in zh)).sort();
if (untranslated.length) {
  console.log(`zh: NOT TRANSLATED ${untranslated.length}`);
  for (const key of untranslated) console.log(`  "${key}"`);
  issues += untranslated.length;
}
console.log(`Literal keys used in sources: ${used.size}`);
console.log(issues === 0 ? 'ALL CLEAN' : `ISSUES: ${issues}`);
process.exit(issues === 0 ? 0 : 1);

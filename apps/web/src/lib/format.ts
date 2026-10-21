import { translateCurrent } from './i18n';
import { getIntlLocale } from './locale';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string): Date | null {
  if (!value) return null;
  if (dateOnlyPattern.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined, short = false): string {
  if (!value) return '—';
  const date = parse(value);
  if (!date) return '—';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return short ? `${month}-${day}` : `${date.getFullYear()}-${month}-${day}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parse(value);
  if (!date) return '—';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}

export function formatMonthDay(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parse(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function todayInput(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDaysInput(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = parse(value);
  if (!date) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function dueLabel(value: string | null | undefined): string {
  const days = daysUntil(value);
  if (days === null) return '—';
  if (days < 0) return translateCurrent('{{days}}d overdue', { days: Math.abs(days) });
  if (days === 0) return translateCurrent('Due today');
  if (days === 1) return translateCurrent('Due tomorrow');
  return translateCurrent('{{days}} days left', { days });
}

export function dueTone(value: string | null | undefined, complete = false): string {
  if (complete) return 'due-done';
  const days = daysUntil(value);
  if (days === null) return '';
  if (days < 0) return 'due-over';
  if (days <= 2) return 'due-soon';
  return 'due-ok';
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parse(value);
  if (!date) return '—';
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (Math.abs(diffMinutes) < 1) return translateCurrent('just now');
  if (diffMinutes > 0 && diffMinutes < 60) {
    return translateCurrent('{{minutes}}m ago', { minutes: diffMinutes });
  }
  if (diffMinutes >= 60 && diffMinutes < 1440) {
    return translateCurrent('{{hours}}h ago', { hours: Math.floor(diffMinutes / 60) });
  }
  if (diffMinutes >= 1440 && diffMinutes < 10080) {
    return translateCurrent('{{days}}d ago', { days: Math.floor(diffMinutes / 1440) });
  }
  return formatDateTime(value);
}

export function initials(name: string): string {
  if (!name) return '?';
  return name.trim().slice(0, 1).toUpperCase();
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(getIntlLocale()).format(value);
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function formatScope(value: string, max = 100): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function daysBetweenInputs(start: string, end: string): number {
  const startDate = parse(start);
  const endDate = parse(end);
  if (!startDate || !endDate) return 0;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn, formatDate, initials } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon, type IconName } from '../lib/icons';
import type { TagTone } from '../lib/labels';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type ButtonSize = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: IconName;
  iconRight?: IconName;
  loading?: boolean;
}

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  quiet: 'btn-quiet',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('btn', buttonVariantClass[variant], size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {!loading && iconLeft ? <Icon name={iconLeft} size={14} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={14} /> : null}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon, label, size = 16, className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn('icon-button', className)}
        aria-label={label}
        title={label}
        {...rest}
      >
        <Icon name={icon} size={size} />
      </button>
    );
  },
);

interface FieldProps {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  const { t } = useI18n();
  return (
    <div className={cn('field', className)}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="field-required">{t('Required')}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn('input', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn('textarea', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <span className="select-wrap">
        <select ref={ref} className={cn('select', className)} {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" size={13} className="select-chevron" />
      </span>
    );
  },
);

export function FormRow({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 }) {
  return <div className={cn('form-row', columns === 3 && 'form-row-3')}>{children}</div>;
}

export function StatusTag({
  tone,
  children,
  outline = false,
}: {
  tone: TagTone;
  children: ReactNode;
  outline?: boolean;
}) {
  return (
    <span className={cn('tag', `tag-${tone}`, outline && 'tag-outline')}>{children}</span>
  );
}

const avatarTones = ['sand', 'sage', 'blue', 'rose', 'slate', 'plum'] as const;

function avatarTone(name: string): (typeof avatarTones)[number] {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return avatarTones[hash % avatarTones.length] ?? 'slate';
}

export function Avatar({
  name,
  size = 26,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('avatar', `avatar-${avatarTone(name)}`, className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((name) => (
        <Avatar key={name} name={name} size={22} />
      ))}
      {rest > 0 ? <span className="avatar-more">+{rest}</span> : null}
    </span>
  );
}

export function DualProgress({
  supply,
  accepted,
  total,
  showLabels = false,
  compact = false,
}: {
  supply: number;
  accepted: number;
  total: number;
  showLabels?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const supplyPercent = total ? Math.round((supply / total) * 100) : 0;
  const acceptedPercent = total ? Math.round((accepted / total) * 100) : 0;
  return (
    <div className={cn('dual-progress', compact && 'dual-progress-compact')}>
      <div className="progress-row">
        <div
          className="progress-track"
          role="progressbar"
          aria-label={t('Evidence supply progress')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={supply}
        >
          <span className="progress-fill progress-fill-supply" style={{ width: `${supplyPercent}%` }} />
        </div>
        {showLabels ? (
          <span className="progress-label">
            {t('Supplied {{supply}}/{{total}}', { supply, total })}
          </span>
        ) : null}
      </div>
      <div className="progress-row">
        <div
          className="progress-track"
          role="progressbar"
          aria-label={t('Acceptance progress')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={accepted}
        >
          <span className="progress-fill progress-fill-accept" style={{ width: `${acceptedPercent}%` }} />
        </div>
        {showLabels ? (
          <span className="progress-label">
            {t('Accepted {{accepted}}/{{total}}', { accepted, total })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = 'clipboard',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : null}
    </span>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="state-block" role="status">
      <Spinner size={18} label={label ?? t('Loading…')} />
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="state-block state-block-error" role="alert">
      <span className="state-icon">
        <Icon name="alert" size={20} />
      </span>
      <div>
        <strong>{title ?? t("Couldn't load data")}</strong>
        {message ? <p>{message}</p> : null}
      </div>
      {onRetry ? (
        <Button size="sm" iconLeft="refresh" onClick={onRetry}>
          {t('Retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="page-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function MetaItem({
  icon,
  children,
}: {
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className="meta-item">
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

export function Deadline({
  date,
  complete = false,
  prefix,
}: {
  date: string | null;
  complete?: boolean;
  prefix?: string;
}) {
  return (
    <span className={cn('deadline', complete && 'deadline-done')}>
      {prefix ? <span className="deadline-prefix">{prefix}</span> : null}
      {formatDate(date, true)}
    </span>
  );
}

export function TagList({ children }: { children: ReactNode }) {
  return <span className="tag-list">{children}</span>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('divider', className)} />;
}

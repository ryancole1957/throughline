import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { IconButton } from './ui';

type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  placement?: 'center' | 'right';
  size?: DialogSize;
  className?: string;
  bodyClassName?: string;
  closeOnBackdrop?: boolean;
  labelledBy?: string;
}

let scrollLockDepth = 0;
const dialogStack: symbol[] = [];

function acquireScrollLock(): void {
  scrollLockDepth += 1;
  if (scrollLockDepth === 1) document.body.classList.add('dialog-open');
}

function releaseScrollLock(): void {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth === 0) document.body.classList.remove('dialog-open');
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  placement = 'center',
  size = 'md',
  className,
  bodyClassName,
  closeOnBackdrop = true,
  labelledBy,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const { t } = useI18n();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    dialogStack.push(token);
    acquireScrollLock();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusTimer = window.setTimeout(() => {
      const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]');
      const focusable = panel?.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? focusable ?? panel)?.focus();
    }, 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => element.offsetParent !== null,
      );
      if (!focusables.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      const index = dialogStack.indexOf(token);
      if (index >= 0) dialogStack.splice(index, 1);
      releaseScrollLock();
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;
  const titleElementId = labelledBy ?? (title ? titleId : undefined);

  return createPortal(
    <div
      className={cn('dialog-overlay', placement === 'right' && 'dialog-overlay-right')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleElementId}
        tabIndex={-1}
        className={cn(
          'dialog-panel',
          `dialog-${placement}`,
          `dialog-size-${size}`,
          className,
        )}
      >
        <div className="dialog-header">
          <div className="dialog-title-group">
            {title ? (
              <h2 className="dialog-title" id={titleId}>
                {title}
              </h2>
            ) : null}
            {description ? <div className="dialog-description">{description}</div> : null}
          </div>
          <IconButton icon="x" label={t('Close')} onClick={onClose} size={17} />
        </div>
        <div className={cn('dialog-body', bodyClassName)}>{children}</div>
        {footer ? <div className="dialog-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

import type { ReactNode } from 'react';

import { useI18n } from '../lib/i18n';
import { Dialog } from './Dialog';
import { Button } from './ui';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const cancelText = cancelLabel ?? t('Cancel');
  const confirmText = confirmLabel ?? t('Confirm');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmText}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

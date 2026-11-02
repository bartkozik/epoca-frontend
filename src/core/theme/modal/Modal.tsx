import Icon, { icons } from '@/core/theme/icon';
import { KeyBoardEventType, useKeyDown, useOnClickOutside } from '@/core/utils/hooks';
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './Modal.module.scss';

interface ModalProps {
  ariaLabelledBy?: string;
  children: React.ReactNode;
  close?: () => void;
  className?: string;
  isOpen: boolean;
  disableClickOutside?: boolean;
  disableEscapeClickClose?: boolean;
  suspendFocusTrap?: boolean;
  overlayClassName?: string;
}

const isAvailableForFocus = (element: HTMLElement): boolean =>
  !element.closest('[hidden], [inert], fieldset:disabled') && element.getAttribute('aria-hidden') !== 'true';

function Modal({
  ariaLabelledBy,
  children,
  close,
  className = '',
  isOpen,
  disableClickOutside = false,
  disableEscapeClickClose = false,
  suspendFocusTrap = false,
  overlayClassName = '',
}: ModalProps): JSX.Element | null {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const handleClickOutside = (): void => {
    if (!disableClickOutside) {
      close?.();
    }
  };

  useOnClickOutside({
    ref: modalRef,
    handler: handleClickOutside,
  });

  const handleClose = useCallback(() => {
    close?.();
  }, [close]);

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ESC,
    action: handleClose,
    isListening: isOpen && !disableEscapeClickClose,
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const focusableElements = modal?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (Array.from(focusableElements ?? []).find(isAvailableForFocus) ?? modal)?.focus();

    return () => {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    if (suspendFocusTrap) return undefined;

    const trapFocus = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusableElements = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(isAvailableForFocus);
      const first = focusableElements[0] ?? modal;
      const last = focusableElements[focusableElements.length - 1] ?? modal;

      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [isOpen, suspendFocusTrap]);

  if (!isOpen) return null;

  return createPortal(
    <div className={clsx(styles.overlay, overlayClassName)}>
      <div
        ref={modalRef}
        aria-label={ariaLabelledBy ? undefined : t('common.modal')}
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={clsx(styles.root, className)}
        role="dialog"
        tabIndex={-1}
      >
        {close && (
          <button aria-label={t('common.close')} className={styles.close} onClick={close} type="button">
            <Icon height={16} width={16} icon={icons.x} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;

import Button, { ButtonVariant } from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import Modal from '@/core/theme/modal';
import PrimaryHeading from '@/core/theme/primaryHeading';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Confirmation.module.scss';

const image = {
  archive: icons.secure,
  attention: icons.attention,
  delete: icons.needles,
  success_add: icons.success,
  warning: icons.warn,
};

const isPromiseLike = (value: unknown): boolean => {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;

  try {
    return typeof (value as { then?: unknown }).then === 'function';
  } catch {
    return true;
  }
};

export interface ConfirmationAction {
  text: string;
  action: () => unknown;
  buttonType?: ButtonVariant;
  disabled?: boolean;
  isFocused?: boolean;
  loading?: boolean;
}

interface ConfirmationProps {
  actionType: keyof typeof image;
  confirmActions: ConfirmationAction[];
  cancelBtnText?: string;
  initialFocusButtonText?: string;
  isOpen: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  text?: string;
  textRole?: 'alert' | 'status';
  title?: string;
}

function Confirmation({
  actionType,
  confirmActions,
  cancelBtnText,
  initialFocusButtonText,
  isOpen,
  isSubmitting = false,
  onCancel,
  text,
  textRole,
  title,
}: ConfirmationProps): JSX.Element {
  const { t } = useTranslation();
  const titleId = useId();
  const [pendingActionIndex, setPendingActionIndex] = useState<number | null>(null);
  const pendingActionRef = useRef(false);
  const actionButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isPending = isSubmitting || pendingActionIndex !== null;
  const requestedFocusIndex =
    initialFocusButtonText === undefined
      ? -1
      : confirmActions.findIndex(({ text: actionText }) => actionText === initialFocusButtonText);
  const markedFocusIndex = confirmActions.findIndex(({ isFocused }) => isFocused);
  const initialFocusIndex = requestedFocusIndex === -1 ? markedFocusIndex : requestedFocusIndex;

  useEffect(() => {
    if (!isOpen || initialFocusIndex === -1) return;

    actionButtonRefs.current[initialFocusIndex]?.focus();
  }, [initialFocusButtonText, initialFocusIndex, isOpen]);

  const handleCancel = (): void => {
    if (isSubmitting || pendingActionRef.current) return;

    onCancel();
  };

  const handleAction =
    (action: ConfirmationAction['action'], actionIndex: number): (() => unknown) =>
    () => {
      if (isSubmitting || pendingActionRef.current) return;

      pendingActionRef.current = true;

      let result: unknown;
      try {
        result = action();
      } catch (error) {
        pendingActionRef.current = false;
        throw error;
      }

      if (!isPromiseLike(result)) {
        pendingActionRef.current = false;
        return result;
      }

      setPendingActionIndex(actionIndex);
      const releasePendingAction = (): void => {
        pendingActionRef.current = false;
        setPendingActionIndex(null);
      };
      void Promise.resolve(result)
        .then(releasePendingAction, releasePendingAction)
        .catch(() => undefined);

      return result;
    };

  return (
    <Modal
      ariaLabelledBy={title ? titleId : undefined}
      className={styles.root}
      close={isPending ? undefined : handleCancel}
      disableClickOutside={isPending}
      disableEscapeClickClose={isPending}
      isOpen={isOpen}
    >
      <div className={styles.blurContainer}>
        {title && (
          <PrimaryHeading className={styles.title} id={titleId}>
            {title}
          </PrimaryHeading>
        )}
        <div className={styles.relativeContainer}>
          <Icon icon={image[actionType]} width={221} height={254} />
          <p className={styles.text} role={textRole}>
            {text}
          </p>
          <div className={styles.footer}>
            <Button
              disabled={isPending}
              label={cancelBtnText || t('common.cancel')}
              onClick={handleCancel}
              variant="text"
            />
            {confirmActions.map(({ text: actionText, action, buttonType, disabled, loading }, index) => {
              const isCurrentActionPending = pendingActionIndex === index;
              const isActionLoading = loading || isCurrentActionPending;

              return (
                <Button
                  aria-label={isActionLoading ? actionText : undefined}
                  disabled={isPending || disabled}
                  forwardedRef={(button) => {
                    actionButtonRefs.current[index] = button;
                  }}
                  key={index}
                  label={actionText}
                  loading={isActionLoading}
                  onClick={handleAction(action, index)}
                  variant={buttonType}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default Confirmation;

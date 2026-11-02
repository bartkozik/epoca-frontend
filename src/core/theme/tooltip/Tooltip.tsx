import {
  Children,
  cloneElement,
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import styles from './Tooltip.module.scss';

const VIEWPORT_MARGIN = 12;

export type TooltipPlacement = 'bottom' | 'top';

export interface TooltipTriggerProps {
  'aria-describedby'?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  tabIndex?: number;
}

export interface TooltipProps {
  children: ReactElement<TooltipTriggerProps>;
  className?: string;
  content: ReactNode;
  hoverOnly?: boolean;
  placement?: TooltipPlacement;
  onVisibilityChange?: (visible: boolean) => void;
  fitViewport?: boolean;
}

const Tooltip = ({
  children,
  className,
  content,
  hoverOnly = false,
  placement = 'bottom',
  onVisibilityChange,
  fitViewport = false,
}: TooltipProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const [fittedPlacement, setFittedPlacement] = useState(placement);
  const [verticalOffset, setVerticalOffset] = useState(0);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const tooltipId = useId();
  const trigger = Children.only(children);
  const visibilityCallback = useRef(onVisibilityChange);
  visibilityCallback.current = onVisibilityChange;
  useLayoutEffect(() => {
    visibilityCallback.current?.(isOpen);
  }, [isOpen]);

  const measureHorizontalOffset = useCallback((): void => {
    const root = rootRef.current;
    const tooltip = tooltipRef.current;

    if (!root || !tooltip) {
      return;
    }

    const rootBounds = root.getBoundingClientRect();
    const tooltipWidth = tooltip.getBoundingClientRect().width;
    const centeredLeft = rootBounds.left + rootBounds.width / 2 - tooltipWidth / 2;
    const centeredRight = centeredLeft + tooltipWidth;
    const leftCorrection = Math.max(0, VIEWPORT_MARGIN - centeredLeft);
    const rightCorrection = Math.min(0, window.innerWidth - VIEWPORT_MARGIN - centeredRight);
    const nextOffset = leftCorrection || rightCorrection;

    setHorizontalOffset((currentOffset) => (currentOffset === nextOffset ? currentOffset : nextOffset));
    if (fitViewport) {
      const height = tooltip.getBoundingClientRect().height;
      const below = window.innerHeight - VIEWPORT_MARGIN - rootBounds.bottom - 5;
      const above = rootBounds.top - VIEWPORT_MARGIN - 5;
      const nextPlacement =
        height <= (placement === 'bottom' ? below : above) ? placement : above > below ? 'top' : 'bottom';
      const top = nextPlacement === 'top' ? rootBounds.top - height - 5 : rootBounds.bottom + 5;
      setFittedPlacement(nextPlacement);
      setVerticalOffset(
        Math.max(VIEWPORT_MARGIN - top, Math.min(0, window.innerHeight - VIEWPORT_MARGIN - top - height)),
      );
    }
  }, [fitViewport, placement]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    measureHorizontalOffset();
    window.addEventListener('resize', measureHorizontalOffset);
    if (fitViewport) window.addEventListener('scroll', measureHorizontalOffset, true);

    return () => {
      window.removeEventListener('resize', measureHorizontalOffset);
      window.removeEventListener('scroll', measureHorizontalOffset, true);
    };
  }, [content, isOpen, measureHorizontalOffset, fitViewport]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const handleBlurCapture = (event: FocusEvent<HTMLSpanElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (isOpen && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    }
  };

  const handleMouseLeave = (event: MouseEvent<HTMLSpanElement>): void => {
    if (hoverOnly || !event.currentTarget.contains(document.activeElement)) {
      setIsOpen(false);
    }
  };

  const handleTriggerClick = (event: MouseEvent<HTMLElement>): void => {
    if (!hoverOnly) {
      event.currentTarget.focus();
      setIsOpen(true);
    }
    trigger.props.onClick?.(event);
  };

  const describedBy = [trigger.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');
  const enhancedTrigger = cloneElement(trigger, {
    'aria-describedby': describedBy,
    onClick: handleTriggerClick,
    tabIndex: trigger.props.tabIndex ?? 0,
  });
  const tooltipStyle = {
    '--tooltip-horizontal-offset': `${horizontalOffset}px`,
    '--tooltip-vertical-offset': `${fitViewport ? verticalOffset : 0}px`,
  } as CSSProperties;

  return (
    <span
      className={clsx(styles.root, className)}
      onBlurCapture={handleBlurCapture}
      onFocusCapture={hoverOnly ? undefined : () => setIsOpen(true)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={handleMouseLeave}
      ref={rootRef}
    >
      {enhancedTrigger}
      <span
        aria-hidden={!isOpen}
        className={clsx(styles.tooltip, styles[fitViewport ? fittedPlacement : placement], {
          [styles.visible]: isOpen,
          [styles.fitViewport]: fitViewport,
        })}
        data-placement={fitViewport ? fittedPlacement : placement}
        id={tooltipId}
        ref={tooltipRef}
        role="tooltip"
        style={tooltipStyle}
      >
        {content}
      </span>
    </span>
  );
};

export default Tooltip;

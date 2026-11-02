import useWindowSize from '@/core/utils/hooks/useWindowSize';
import { KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import clsx from 'clsx';
import styles from './Tabs.module.scss';

export type Tab = {
  element: ReactNode;
  label: string;
  value: string;
};

type TabsProps = {
  layout?: 'responsive' | 'inline';
  className?: string;
  ariaLabel?: string;
  keepMounted?: boolean;
  onTabClick?: (value: string) => void;
  tabs: Tab[];
};

const getActiveTabIndex = (tab: string | undefined, tabs: Tab[]): number => {
  const routeTabIndex = tabs.findIndex(({ value }) => value === tab);

  return routeTabIndex >= 0 ? routeTabIndex : 0;
};

const Tabs = ({
  onTabClick,
  tabs,
  layout = 'responsive',
  ariaLabel,
  keepMounted = false,
  className,
}: TabsProps): JSX.Element => {
  const { tab } = useParams();
  const id = useId().replace(/:/g, '');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const routeTabIndex = getActiveTabIndex(tab, tabs);
  const [activeTabIndex, setActiveTabIndex] = useState(routeTabIndex);
  const [viewportWidth] = useWindowSize();
  const screenXsMax = Number.parseInt(styles.screenXsMax, 10);
  const orientation = layout === 'inline' || viewportWidth <= screenXsMax ? 'horizontal' : 'vertical';

  const activateTab = (index: number, value: string): void => {
    onTabClick?.(value);
    setActiveTabIndex(index);
  };

  useEffect(() => {
    setActiveTabIndex(routeTabIndex);
  }, [routeTabIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let nextIndex: number | undefined;
    const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

    switch (event.key) {
      case previousKey:
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case nextKey:
        nextIndex = (index + 1) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;

    activateTab(nextIndex, nextTab.value);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={clsx(styles.root, layout === 'inline' && styles.inline, className)}>
      <div aria-label={ariaLabel} aria-orientation={orientation} className={styles.detailsOptions} role="tablist">
        {tabs.map(({ value, label }, i) => (
          <button
            key={value}
            ref={(element) => {
              tabRefs.current[i] = element;
            }}
            aria-controls={`${id}-tabpanel-${i}`}
            aria-selected={i === activeTabIndex}
            className={clsx(styles.headline, i === activeTabIndex ? styles.selected : '')}
            id={`${id}-tab-${i}`}
            onClick={() => activateTab(i, value)}
            onKeyDown={(event) => handleKeyDown(event, i)}
            role="tab"
            tabIndex={i === activeTabIndex ? 0 : -1}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(({ element, value }, i) => {
        const isActive = i === activeTabIndex;

        return (
          <div
            key={`${value}-panel`}
            aria-labelledby={`${id}-tab-${i}`}
            className={styles.content}
            hidden={!isActive}
            id={`${id}-tabpanel-${i}`}
            role="tabpanel"
            tabIndex={isActive ? 0 : -1}
          >
            {isActive || keepMounted ? element : null}
          </div>
        );
      })}
    </div>
  );
};

export default Tabs;

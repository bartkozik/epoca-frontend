import { forwardRef } from 'react';
import clsx from 'clsx';
import styles from './ScrolledContainer.module.scss';

interface ScrolledContainerProps {
  children: React.ReactNode;
  className?: string;
}

const ScrolledContainer = forwardRef<HTMLDivElement, ScrolledContainerProps>(({ children, className }, ref) => (
  <div className={clsx(styles.root, className)} ref={ref}>
    {children}
  </div>
));

ScrolledContainer.displayName = 'ScrolledContainer';

export default ScrolledContainer;

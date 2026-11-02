import { useRef } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './Spinner.module.scss';

interface SpinnerProps {
  className?: string;
  loading?: boolean;
  small?: boolean;
  white?: boolean;
}

const Spinner = ({ className = '', loading, small = false, white = false }: SpinnerProps): JSX.Element => {
  const spinnerRef = useRef(null);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={clsx(styles.root, className)}
          ref={spinnerRef}
        >
          <span className={clsx(styles.loader, { [styles.small]: small, [styles.white]: white })} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Spinner;

import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './UnitLoader.module.scss';

interface UnitLoaderProps {
  loading?: boolean;
}

const UnitLoader = ({ loading }: UnitLoaderProps): JSX.Element => {
  const loaderRef = useRef(null);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          className={styles.root}
          ref={loaderRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span className={styles.loader}></span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UnitLoader;

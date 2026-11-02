import Icon, { icons } from '@/core/theme/icon';
import { MAX_TABLE_ITEM_NAME_LENGTH } from '@/core/utils/constants';
import { shortenTextToLength } from '@/core/utils/helpers';
import styles from './FilterPanelTag.module.scss';

interface FilterPanelTagProps {
  /** Filter category, e.g. "User". */
  category: string;
  /** Selected value(s), e.g. "Adam Jankowski +1". */
  value: string;
  /** Accessible name of the remove button, e.g. "Remove user filter". */
  removeLabel: string;
  onRemove: () => void;
}

const FilterPanelTag = ({ category, value, removeLabel, onRemove }: FilterPanelTagProps): JSX.Element => (
  <span className={styles.root}>
    <span className={styles.text} title={`${category}: ${value}`}>
      <span className={styles.category}>{`${category}:`}</span>{' '}
      <span className={styles.value}>{shortenTextToLength(value, MAX_TABLE_ITEM_NAME_LENGTH)}</span>
    </span>
    <button type="button" className={styles.remove} aria-label={removeLabel} onClick={onRemove}>
      <Icon icon={icons.cross} width={9} height={9} />
    </button>
  </span>
);

export default FilterPanelTag;

import stylesVariables from '@/core/theme/variables.module.scss';
import styles from './TableItemName.module.scss';

interface TableItemNameProps {
  color?: string;
  name: string;
}

const TableItemName = ({ color, name }: TableItemNameProps): JSX.Element => {
  const colorBallBackground = { backgroundColor: color ?? stylesVariables.colorSuccess };

  return (
    <div className={styles.root}>
      {color && <div className="color-ball" style={colorBallBackground}></div>}
      <span className={styles.name} title={name}>
        {name}
      </span>
    </div>
  );
};

export default TableItemName;

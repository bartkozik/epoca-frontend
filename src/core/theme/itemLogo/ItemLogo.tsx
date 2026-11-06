import clsx from 'clsx';
import styles from './ItemLogo.module.scss';

interface ItemLogoImageProps<T> {
  className?: string;
  dataTestId?: string;
  item: T;
}

const ItemLogo = <T extends { logo?: string; name: string }>({
  item,
  className,
  dataTestId,
}: ItemLogoImageProps<T>): JSX.Element => {
  const { logo, name } = item;

  return (
    <div
      className={clsx(styles.root, className)}
      data-testid={dataTestId}
      style={{ backgroundImage: logo ? `url(${logo})` : 'none' }}
    >
      {!logo && <span>{name.charAt(0).toUpperCase()}</span>}
    </div>
  );
};

export default ItemLogo;

import dayjs from 'dayjs';
import styles from './FormHeader.module.scss';

interface FormHeaderProps {
  date?: Date;
  title: string;
}

function FormHeader({ date, title }: FormHeaderProps): JSX.Element {
  const formattedDate = dayjs(date).format('DD MMMM YYYY');

  return (
    <header className={styles.header}>
      <span>{title}</span>
      {date && <p className={styles.subtitle}>{formattedDate}</p>}
    </header>
  );
}

export default FormHeader;

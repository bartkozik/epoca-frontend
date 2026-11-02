import { URL_REGEX } from '@/core/utils/regex';
import clsx from 'clsx';
import styles from './LinkCreator.module.scss';

interface LinkCreatorProps {
  text: string | undefined;
  className?: string;
}

const LinkCreator = ({ text, className }: LinkCreatorProps): JSX.Element | null => {
  if (!text) return null;

  const parts = text.split(URL_REGEX);

  return (
    <>
      {parts.map((part, index) =>
        URL_REGEX.test(part) ? (
          <a className={clsx(styles.link, className)} key={index} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
};

export default LinkCreator;

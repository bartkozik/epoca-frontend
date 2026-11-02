import redactedImage from '@/core/theme/assets/redacted-image.svg';
import React from 'react';
import styles from './Slide.module.scss';

const exampleImg = redactedImage;

interface SlideProps {
  title: string;
  text: string;
  backgroundImageUrl?: string;
  exampleAltText?: string;
}

const Slide = ({ title, text, backgroundImageUrl, exampleAltText }: SlideProps): JSX.Element => {
  const backgroundStyle = {
    backgroundImage: `url(${backgroundImageUrl})`,
  };
  return (
    <div className={styles.slide} style={backgroundStyle}>
      {exampleAltText && <img alt={exampleAltText} className={styles.exampleImg} src={exampleImg} />}
      <div className={styles.textBox}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.text}>{text}</p>
      </div>
    </div>
  );
};

export default Slide;

import redactedImage from '@/core/theme/assets/redacted-image.svg';
import slideBackgroundTimeTracker from '@/core/theme/assets/images/onboardingCarouselSlides/onboarding-slide-backgroud.png';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSwipeable } from 'react-swipeable';
import clsx from 'clsx';
import styles from './OnboardingCarousel.module.scss';
import Slide from './slide';

const slideBackgroundClientPanel = redactedImage;
const slideBackgroundExportData = redactedImage;

interface OnboardingCarouselProps {
  interval?: number;
}

const OnboardingCarousel = ({ interval }: OnboardingCarouselProps): JSX.Element => {
  const { t } = useTranslation();

  const [slide, setSlide] = useState(0);

  const handlers = useSwipeable({
    onSwipedLeft: () => setSlide((prevSlide) => (prevSlide + 1) % nonAuthedPageSlides.length),
    onSwipedRight: () => setSlide((prevSlide) => (prevSlide === 0 ? nonAuthedPageSlides.length - 1 : prevSlide - 1)),
  });

  const nonAuthedPageSlides = [
    {
      title: t('app.router.non_authed_page_slides.time_tracker.title'),
      text: t('app.router.non_authed_page_slides.time_tracker.text'),
      backgroundImageUrl: slideBackgroundTimeTracker,
      exampleAltText: t('app.router.non_authed_page_slides.time_tracker.alt_text'),
    },
    {
      title: t('app.router.non_authed_page_slides.export_data.title'),
      text: t('app.router.non_authed_page_slides.export_data.text'),
      backgroundImageUrl: slideBackgroundExportData,
    },
    {
      title: t('app.router.non_authed_page_slides.client_panel.title'),
      text: t('app.router.non_authed_page_slides.client_panel.text'),
      backgroundImageUrl: slideBackgroundClientPanel,
    },
  ];

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (interval) {
      timer = setInterval(() => {
        setSlide((prevSlide) => (prevSlide + 1) % nonAuthedPageSlides.length);
      }, interval);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [interval, nonAuthedPageSlides.length]);

  return (
    <div {...handlers} className={styles.root} data-testid="onboardingCarousel">
      {nonAuthedPageSlides.map((slideContent, index) => (
        <div key={index} className={clsx(styles.carouselItem, { [styles.active]: index === slide })}>
          <Slide {...slideContent} />
        </div>
      ))}
      <div className={styles.sliderDots}>
        {Array.from({ length: nonAuthedPageSlides.length }).map((_, index) => (
          <div
            key={index}
            className={clsx(styles.dot, { [styles.active]: index === slide })}
            onClick={() => setSlide(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default OnboardingCarousel;

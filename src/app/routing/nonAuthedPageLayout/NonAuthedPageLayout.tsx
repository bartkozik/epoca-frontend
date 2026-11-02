import OnboardingCarousel from '@/app/routing/nonAuthedPageLayout/onboardingCarousel';
import { paths } from '@/app/routing/paths';
import LogoImage from '@/core/theme/logoImage';
import { CAROUSEL_SLIDER_TIME } from '@/core/utils/constants';
import React from 'react';
import { Outlet } from 'react-router-dom';
import clsx from 'clsx';
import styles from './NonAuthedPageLayout.module.scss';

const NonAuthedPageLayout = (): JSX.Element => {
  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <LogoImage className={styles.logo} to={paths.index} />
        <Outlet />
      </div>
      <div className={clsx(styles.sideBoard, styles.gradient)}>
        <OnboardingCarousel interval={CAROUSEL_SLIDER_TIME} />
      </div>
    </div>
  );
};

export default NonAuthedPageLayout;

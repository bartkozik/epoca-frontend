import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/pl';

export const useInitializeLanguage = (userChosenLanguage: string): void => {
  const { i18n } = useTranslation();
  useEffect(() => {
    if (userChosenLanguage) {
      void i18n.changeLanguage(userChosenLanguage);
      dayjs.locale(userChosenLanguage);
    }
  }, [userChosenLanguage, i18n]);
};

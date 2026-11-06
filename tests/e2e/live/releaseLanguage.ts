import { expect, type Page } from '@playwright/test';

export type ReleaseLanguage = 'pl' | 'en';

export const selectReleaseLanguage = async (page: Page, language: ReleaseLanguage): Promise<void> => {
  await page.getByTestId('user-avatar-menu-button').click();
  await page.getByRole('button', { name: /^(Zmień język|Change language)$/ }).click();
  await page.getByRole('button', { name: language.toUpperCase(), exact: true }).click();
  const label = language === 'pl' ? 'Czas pracy' : 'Working time';
  await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem(`IteratorsEpoca__user__lang_${window.location.hostname}`)))
    .toBe(language);
  await page.reload();
  await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
};

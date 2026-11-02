import type { Page } from '@playwright/test';

export const openProjectDetails = async (page: Page, projectName: string): Promise<void> => {
  await page.goto('/projects');
  await page
    .getByRole('row', { name: new RegExp(projectName) })
    .getByRole('button', { name: 'Szczegóły' })
    .click();
};

export const openWorkUnitForm = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '+ Dodaj aktywność', exact: true }).first().click();
};

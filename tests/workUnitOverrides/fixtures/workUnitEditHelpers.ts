import type { Locator } from '@playwright/test';

export async function chooseProject(dialog: Locator, projectName: string): Promise<void> {
  await dialog.getByRole('button', { name: 'Client and project', exact: true }).click();
  await dialog.getByText(projectName, { exact: true }).click();
}

import { expect, type Locator, type Page, type Response } from '@playwright/test';

export async function fillLiveWorkUnitOverride(dialog: Locator, projectName: string, taskId: string): Promise<void> {
  const project = dialog.getByRole('button', { name: /^(?:Klienci i projekty|Client and project)$/ });
  await expect(project).toBeEnabled();
  await project.click();
  await dialog.getByText(projectName, { exact: true }).last().click();
  await dialog.getByLabel(/^(?:ID zadania|Task ID)$/).fill(taskId);
}

export async function saveLiveWorkUnitOverride(page: Page, dialog: Locator, endpoint: URL): Promise<Response> {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return (
        candidate.request().method() === 'PUT' && url.origin === endpoint.origin && url.pathname === endpoint.pathname
      );
    }),
    dialog.getByRole('button', { name: /^(?:Aktualizuj|Update)$/ }).click(),
  ]);
  return response;
}

export async function undoLiveWorkUnitOverride(page: Page, dialog: Locator, endpoint: URL): Promise<Response> {
  const historyName = /^(?:Historia korekt|Correction history)$/;
  const history = dialog.getByRole('region', { name: historyName });
  if (!(await history.isVisible())) await dialog.getByRole('button', { name: historyName }).click();
  await history.getByRole('button', { name: /^(?:Usuń korektę|Remove correction)$/ }).click();
  const confirmation = page.getByRole('dialog', {
    name: /^(?:Usunąć ostatnią korektę\?|Remove the latest correction\?)$/,
  });
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return (
        candidate.request().method() === 'POST' &&
        url.origin === endpoint.origin &&
        url.pathname === `${endpoint.pathname}/undo`
      );
    }),
    confirmation.getByRole('button', { name: /^(?:Usuń korektę|Remove correction)$/ }).click(),
  ]);
  await expect(confirmation).toHaveCount(0);
  return response;
}

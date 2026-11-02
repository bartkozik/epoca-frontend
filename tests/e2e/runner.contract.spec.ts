import { expect, test } from './fixtures/epocaTest';

test.use({ world: 'world-1', actor: 'anonymous' });

test('@mr serves the frontend from the application origin', async ({ page }) => {
  await page.goto('/login');

  await expect(page).toHaveURL('http://127.0.0.1:5173/login');
  await expect(page.getByTestId('loginEmailInput')).toBeVisible();
  await expect(page.getByTestId('loginPasswordInput')).toBeVisible();
});

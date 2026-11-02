import api from '@/core/api/Api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitationForm from './InvitationForm';

vi.mock('@/core/api/Api', () => ({ default: { post: vi.fn() } }));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

it('reuses the request key for retries but starts a fresh attempt after reopening the form', async () => {
  vi.mocked(api.post).mockRejectedValue({ isAxiosError: true, code: 'ECONNABORTED' });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const props = { isOpen: true, organizationSlug: 'acme', onClose: vi.fn() };
  const view = render(<InvitationForm {...props} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  const user = userEvent.setup();
  const fill = async (): Promise<void> => {
    await user.type(screen.getByLabelText('invitations.form.firstName'), 'Ada');
    await user.type(screen.getByLabelText('invitations.form.lastName'), 'Lovelace');
    await user.type(screen.getByLabelText('invitations.form.email'), 'ada@example.com');
  };
  const submit = async (): Promise<void> => {
    await user.click(screen.getByRole('button', { name: 'invitations.form.submit' }));
    expect(await screen.findByText('invitations.error.retry')).toBeInTheDocument();
  };
  const requestKey = (index: number): unknown => vi.mocked(api).post.mock.calls[index][2]?.headers?.['Idempotency-Key'];

  await fill();
  await submit();
  await submit();
  expect(requestKey(0)).toEqual(expect.any(String));
  expect(requestKey(1)).toBe(requestKey(0));

  view.rerender(<InvitationForm {...props} isOpen={false} />);
  view.rerender(<InvitationForm {...props} />);
  await fill();
  await submit();
  expect(api.post).toHaveBeenCalledTimes(3);
  expect(requestKey(2)).toEqual(expect.any(String));
  expect(requestKey(2)).not.toBe(requestKey(0));
  client.clear();
});

import { StrictMode, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { exchangeInvitation, getInvitationSummary } from '../requests';
import { useInvitationInitialization } from './useInvitationInitialization';

vi.mock('../requests', () => ({ exchangeInvitation: vi.fn(), getInvitationSummary: vi.fn() }));

it('settles a rejected initial session and preserves the token through StrictMode replay', () => {
  window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
  const exchangeToken = { current: null as string | null };
  const onError = vi.fn();
  const onSettled = vi.fn();
  renderHook(
    () =>
      useInvitationInitialization({
        mounted: { current: false },
        exchangeToken,
        isCurrent: () => false,
        onSummary: vi.fn(),
        onError,
        onSettled,
      }),
    { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> },
  );
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'session-changed' }));
  expect(onSettled).toHaveBeenCalled();
  expect(exchangeToken.current).toBe('mail-secret');
  expect(window.location.hash).toBe('');
  expect(exchangeInvitation).not.toHaveBeenCalled();
  expect(getInvitationSummary).not.toHaveBeenCalled();
});

it('uses the preserved token if the session becomes current during effect replay', async () => {
  window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
  vi.mocked(exchangeInvitation).mockResolvedValue({} as Awaited<ReturnType<typeof exchangeInvitation>>);
  const isCurrent = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  const onSummary = vi.fn();
  renderHook(
    () =>
      useInvitationInitialization({
        mounted: { current: false },
        exchangeToken: { current: null },
        isCurrent,
        onSummary,
        onError: vi.fn(),
        onSettled: vi.fn(),
      }),
    { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> },
  );
  await waitFor(() => expect(onSummary).toHaveBeenCalled());
  expect(exchangeInvitation).toHaveBeenCalledWith('mail-secret', undefined);
  expect(getInvitationSummary).not.toHaveBeenCalled();
});

import { act, renderHook } from '@testing-library/react';
import type { InvitationDto } from '../models/invitationDto.model';
import { useInvitationDeliveryNotifications } from './useInvitationDeliveryNotifications';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: toast }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const invitation: InvitationDto = {
  id: '17d1bb14-4509-4030-932e-6cffcab68299',
  email: 'anna@example.test',
  firstName: 'Anna',
  lastName: 'Kowalska',
  roles: ['Employee'],
  protocolVersion: 2,
  revision: '1',
  status: 'Pending',
  expiresAt: null,
  delivery: { status: 'Started', lastAttemptAt: '2026-10-06T08:00:00Z', retryAfterSeconds: 60 },
  createdAt: '2026-10-06T08:00:00Z',
  modifiedAt: '2026-10-06T08:00:00Z',
};
const withStatus = (status: string): InvitationDto => ({ ...invitation, delivery: { ...invitation.delivery, status } });
beforeEach(() => toast.mockClear());

it.each([
  ['Failed', 'error'],
  ['Sent', 'success'],
  ['Unknown', 'warning'],
])('reports asynchronous %s once after a submitted send, without treating Started as success', (status, type) => {
  const { result, rerender } = renderHook(({ items }) => useInvitationDeliveryNotifications(items), {
    initialProps: { items: [invitation] },
  });
  expect(toast).not.toHaveBeenCalled();
  act(() => result.current(invitation));
  expect(toast).toHaveBeenLastCalledWith({ content: 'invitations.delivery.Started', type: 'info' });
  rerender({ items: [withStatus(status)] });
  expect(toast).toHaveBeenLastCalledWith({ content: `invitations.delivery.${status}`, type });
  rerender({ items: [withStatus(status)] });
  expect(toast).toHaveBeenCalledTimes(2);
});
it.each([
  ['2026-10-06T08:00:00.391806387Z', '2026-10-06T08:00:00.391806Z'],
  ['2026-10-06T08:00:00.391999987Z', '2026-10-06T08:00:00.392000Z'],
])('matches the send response %s to its persisted timestamp %s', (responseTime, persistedTime) => {
  const sending = { ...invitation, delivery: { ...invitation.delivery, lastAttemptAt: responseTime } };
  const failure = {
    ...withStatus('Failed'),
    delivery: { ...withStatus('Failed').delivery, lastAttemptAt: persistedTime },
  };
  const { result, rerender } = renderHook(({ items }) => useInvitationDeliveryNotifications(items), {
    initialProps: { items: [sending] },
  });
  act(() => result.current(sending));
  rerender({ items: [failure] });
  expect(toast).toHaveBeenLastCalledWith({ content: 'invitations.delivery.Failed', type: 'error' });
  expect(toast).toHaveBeenCalledTimes(2);
  act(() => result.current(sending));
  expect(toast).toHaveBeenLastCalledWith({ content: 'invitations.delivery.Failed', type: 'error' });
});
it('uses a final result already refreshed before the write callback', () => {
  const { result } = renderHook(() => useInvitationDeliveryNotifications([withStatus('Failed')]));
  act(() => result.current(invitation));
  expect(toast).toHaveBeenCalledExactlyOnceWith({ content: 'invitations.delivery.Failed', type: 'error' });
});
it('does not toast historical failures or another send attempt', () => {
  const { result, rerender } = renderHook(({ items }) => useInvitationDeliveryNotifications(items), {
    initialProps: { items: [withStatus('Failed')] },
  });
  expect(toast).not.toHaveBeenCalled();
  rerender({ items: [invitation] });
  act(() => result.current(invitation));
  rerender({
    items: [
      {
        ...withStatus('Failed'),
        delivery: { ...withStatus('Failed').delivery, lastAttemptAt: '2026-10-06T08:05:00Z' },
      },
    ],
  });
  expect(toast).toHaveBeenCalledTimes(1);
});
it('ignores late callbacks after leaving the organization or page', () => {
  const { result, unmount } = renderHook(() => useInvitationDeliveryNotifications([invitation]));
  const notify = result.current;
  unmount();
  act(() => notify(withStatus('Failed')));
  expect(toast).not.toHaveBeenCalled();
});

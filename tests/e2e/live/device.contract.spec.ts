import { expect, test } from '@playwright/test';
import { liveWorkUnitIdempotencyKey, withLiveDeviceHeader } from './device';

test('Node live API requests carry one stable non-overridable device identity @mr @technical', () => {
  const first = withLiveDeviceHeader({ Accept: 'application/json' });
  const second = withLiveDeviceHeader({ 'device-id': 'caller-controlled' });

  expect(first.Accept).toBe('application/json');
  expect(first['device-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  expect(second['device-id']).toBe(first['device-id']);
});

test('live work-unit idempotency derives stable canonical UUIDs from run intent @mr @technical', () => {
  const first = liveWorkUnitIdempotencyKey('ct530-93673-precise-work-unit');

  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  expect(liveWorkUnitIdempotencyKey('ct530-93673-precise-work-unit')).toBe(first);
  expect(liveWorkUnitIdempotencyKey('ct530-93674-precise-work-unit')).not.toBe(first);
});

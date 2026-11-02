import { randomUUID } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';

const LIVE_DEVICE_ID = randomUUID();
const LIVE_IDEMPOTENCY_NAMESPACE = 'c7530000-0000-4530-8000-000000000000';

export const withLiveDeviceHeader = (headers: Record<string, string> = {}): Record<string, string> => ({
  ...headers,
  'device-id': LIVE_DEVICE_ID,
});

export const liveWorkUnitIdempotencyKey = (intentId: string): string =>
  uuidv5(intentId, LIVE_IDEMPOTENCY_NAMESPACE);

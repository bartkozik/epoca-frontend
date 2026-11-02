import { getDraftReminderRemainingMs, postponeDraftReminder } from './draftReminder';

describe('draft reminder postponement', () => {
  beforeEach(() => localStorage.clear());

  it('postpones the reminder for 24 hours, including after a page remount', () => {
    const dismissedAt = Date.parse('2026-09-29T12:00:00.000Z');
    postponeDraftReminder('user-1', 'acme', dismissedAt);

    expect(getDraftReminderRemainingMs('user-1', 'acme', dismissedAt + 1_000)).toBe(86_399_000);
    expect(getDraftReminderRemainingMs('user-1', 'acme', dismissedAt + 86_400_000)).toBe(0);
  });

  it('keeps postponements separate for users and workspaces', () => {
    const dismissedAt = Date.parse('2026-09-29T12:00:00.000Z');
    postponeDraftReminder('user-1', 'acme', dismissedAt);

    expect(getDraftReminderRemainingMs('user-2', 'acme', dismissedAt)).toBe(0);
    expect(getDraftReminderRemainingMs('user-1', 'other', dismissedAt)).toBe(0);
  });
});

const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

const reminderKey = (userId: string, organizationSlug: string): string =>
  `workingTime:unreportedDraftsReminder:${encodeURIComponent(userId)}:${encodeURIComponent(organizationSlug)}`;

export const getDraftReminderRemainingMs = (userId: string, organizationSlug: string, now = Date.now()): number => {
  if (!userId || !organizationSlug) return 0;
  const dismissedAt = Number(localStorage.getItem(reminderKey(userId, organizationSlug)));
  return Number.isFinite(dismissedAt) ? Math.max(0, dismissedAt + REMINDER_DELAY_MS - now) : 0;
};

export const postponeDraftReminder = (userId: string, organizationSlug: string, now = Date.now()): void => {
  if (userId && organizationSlug) localStorage.setItem(reminderKey(userId, organizationSlug), String(now));
};

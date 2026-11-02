import { formatIntegrationClientDateTime } from './dateTime';

const INSTANT = '2026-01-02T03:04:05Z';

describe('formatIntegrationClientDateTime', () => {
  it.each(['en-GB', 'pl-PL'])('formats a UTC instant in the active %s locale and browser timezone', (locale) => {
    const expected = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(INSTANT));

    expect(formatIntegrationClientDateTime(INSTANT, locale, 'Missing', 'Unavailable')).toBe(expected);
  });

  it('uses the supplied localized null fallback', () => {
    expect(formatIntegrationClientDateTime(null, 'en-GB', 'No expiration', 'Unavailable')).toBe('No expiration');
    expect(formatIntegrationClientDateTime(null, 'pl-PL', 'Nigdy nie użyto', 'Niedostępne')).toBe('Nigdy nie użyto');
  });

  it('fails safely with the supplied localized fallback for an invalid timestamp', () => {
    expect(formatIntegrationClientDateTime('not-a-date', 'en-GB', 'Missing', 'Unavailable')).toBe('Unavailable');
    expect(formatIntegrationClientDateTime('not-a-date', 'pl-PL', 'Brak', 'Niedostępne')).toBe('Niedostępne');
  });
});

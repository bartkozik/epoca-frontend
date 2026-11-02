export const formatIntegrationClientDateTime = (
  value: string | null,
  locale: string,
  nullFallback: string,
  invalidFallback: string,
): string => {
  if (value === null) return nullFallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return invalidFallback;

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return invalidFallback;
  }
};

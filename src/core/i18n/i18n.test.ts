import i18n from './i18n';

describe('i18n key parsing', () => {
  it('translates OAuth scopes whose API names contain a colon', async () => {
    const previousLanguage = i18n.language;

    try {
      await i18n.changeLanguage('pl');

      expect(i18n.t('team_seatings.integrations.form.scope.organization:read')).toBe('Odczyt organizacji');
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
});

import { initReactI18next } from 'react-i18next';
import i18n, { ResourceKey } from 'i18next';
import ICU from 'i18next-icu';
import resourcesToBackend from 'i18next-resources-to-backend';
import { resources } from './index';

void i18n
  .use(ICU)
  .use(initReactI18next)
  .use(
    resourcesToBackend((language, namespace, callback) => {
      // The dynamic `import()` specifier is built from `language`/`namespace`, so TS can't
      // statically resolve the imported module's type (it resolves to `any`) -- annotating the
      // resolved/rejected values here matches exactly what `callback` (i18next's `ReadCallback`)
      // expects, without changing what's actually passed at runtime.
      import(`./locales/${language}/${namespace}.json`)
        .then((resources: ResourceKey) => callback(null, resources))
        .catch((error: unknown) => callback(error instanceof Error ? error : String(error), null));
    }),
  )
  .init({
    resources,
    lng: 'en',
    // debug: true,
    fallbackLng: 'en',
    nsSeparator: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

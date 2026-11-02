import { readdirSync, readFileSync } from 'node:fs';
import en from '@/core/i18n/locales/en/translation.json';
import pl from '@/core/i18n/locales/pl/translation.json';

it('translates every static correction UI/controller key and its dynamic variants in both languages', () => {
  const directory = 'src/modules/reports/report/workUnitOverride';
  const keys = new Set(
    readdirSync(directory)
      .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.') && !name.includes('TestFixtures'))
      .flatMap((name) =>
        [
          ...readFileSync(`${directory}/${name}`, 'utf8').matchAll(
            /['"]((?:reports\.override|common)\.[A-Za-z._]+)['"]/g,
          ),
        ].map((match) => match[1]),
      ),
  );
  for (const suffix of [
    'taskMode.Inherit',
    'taskMode.Clear',
    'taskMode.Set',
    'project.resolving',
    'project.unavailable',
    'history.operation.Replace',
    'history.operation.initial',
    'history.operation.Clear',
    'history.operation.unknown',
    'error.conflict',
    'error.uncertain',
    'conflict.current',
    'conflict.proposed',
  ])
    keys.add(`reports.override.${suffix}`);
  for (const key of keys) {
    expect((en as Record<string, string>)[key], `English: ${key}`).toBeTruthy();
    expect((pl as Record<string, string>)[key], `Polish: ${key}`).toBeTruthy();
  }
  expect(en['reports.override.badge']).toBe('Corrected');
  expect(pl['reports.override.badge']).toBe('Skorygowano');
  expect(en).toMatchObject({
    'reports.override.undo.action': 'Remove correction',
    'reports.override.undo.title': 'Remove the latest correction?',
    'reports.override.undo.confirm': 'Remove correction',
    'reports.override.undo.message':
      'Values from before this correction will be restored. The worklog and its history will be kept.',
    'reports.override.undo.dirty': 'Save or discard the unsaved form changes first.',
    'reports.override.undo.reverted': 'Removed by {actor}',
    'reports.override.history.operation.Replace': 'Report values replaced',
    'reports.override.history.operation.initial': 'Correction introduced',
    'reports.override.history.operation.Undo': 'Earlier values restored',
    'reports.override.history.current': 'Currently applied',
    'reports.override.history.restoredPrevious': 'Returned to the previous correction.',
    'reports.override.history.restoredOriginal': 'Returned to the original entry.',
    'reports.override.undo.legacy': 'Complete historical data is unavailable for undoing the earlier correction.',
    'reports.override.undo.unavailable':
      'The previous project cannot be restored with the current permissions or project state.',
  });
  expect(pl).toMatchObject({
    'reports.override.undo.action': 'Usuń korektę',
    'reports.override.undo.title': 'Usunąć ostatnią korektę?',
    'reports.override.undo.confirm': 'Usuń korektę',
    'reports.override.undo.message': 'Przywrócimy wartości sprzed tej korekty. Wpis i historia pozostaną zachowane.',
    'reports.override.undo.dirty': 'Najpierw zapisz lub odrzuć niezapisane zmiany formularza.',
    'reports.override.undo.reverted': 'Usunięta przez {actor}',
    'reports.override.history.operation.Replace': 'Zastąpiono wartości w raporcie',
    'reports.override.history.operation.initial': 'Wprowadzono korektę',
    'reports.override.history.operation.Undo': 'Przywrócono wcześniejsze wartości',
    'reports.override.history.current': 'Obecnie obowiązuje',
    'reports.override.history.restoredPrevious': 'Powrót do poprzedniej korekty.',
    'reports.override.history.restoredOriginal': 'Powrót do pierwotnego wpisu.',
    'reports.override.undo.legacy': 'Brak pełnych danych historycznych do cofnięcia wcześniejszej korekty.',
    'reports.override.undo.unavailable':
      'Nie można przywrócić poprzedniego projektu przy obecnych uprawnieniach lub stanie projektu.',
  });
});

import { MultiSearchOptionMeta, MultiSearchProps, SelectOption } from '@/core/theme/inputs/types';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import MultiSearch from './MultiSearch';

const translations: Record<string, string> = {
  'common.clear': 'Clear',
  'common.no_results_found': 'No results found',
  'common.multi_search.selected_group': 'Selected ({count})',
  'common.multi_search.no_data_group': 'No data in this view',
  'common.multi_search.archived_group': 'Archived ({count})',
  'common.multi_search.archived_tag': 'Archived',
  'common.multi_search.select_matching': 'Select {count} matching',
  'common.multi_search.selected_count': '{count} selected',
  'common.multi_search.no_options': 'No options',
};

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, params?: Record<string, string | number>) =>
      (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')),
  }),
}));

const option = (label: string, value: string, extra: Partial<SelectOption> = {}): SelectOption => ({
  label,
  value,
  ...extra,
});

const ITEMS = [
  option('Zulu', 'zulu'),
  option('Beta', 'beta', { email: 'beta@example.test' }),
  option('Alpha', 'alpha', { clientName: 'Acme' }),
];

type HarnessProps = Partial<Omit<MultiSearchProps, 'value' | 'onChange'>> & {
  initial?: string[];
  onChange?: (values: string[]) => void;
};

const Harness = ({ initial = [], onChange, ...props }: HarnessProps): JSX.Element => {
  const [value, setValue] = useState(initial);
  return (
    <MultiSearch
      items={ITEMS}
      label="Project:"
      name="project"
      allLabel="All projects"
      searchPlaceholder="Search projects"
      {...props}
      value={value}
      onChange={(values) => {
        onChange?.(values);
        setValue(values);
      }}
    />
  );
};

const combobox = (): HTMLElement => screen.getByRole('combobox', { name: 'Project:' });
const openList = (): void => {
  fireEvent.click(combobox());
};
// Test builds render SVG imports as their file name; leave them out of the visible option text.
const optionLabels = (): string[] =>
  screen.getAllByRole('option').map(
    (element) =>
      element.textContent
        ?.replace(/[\w-]+\.svg/g, '')
        .replace(/\s+/g, ' ')
        .trim() ?? '',
  );
const optionNamed = (name: string): HTMLElement =>
  screen.getAllByRole('option').find((element) => element.textContent?.includes(name))!;

describe('MultiSearch', () => {
  it('shows the selection as the field value and the all-label when nothing is selected', () => {
    const { rerender } = render(<Harness />);
    expect(combobox()).toHaveValue('');
    expect(combobox()).toHaveAttribute('placeholder', 'All projects');

    rerender(<Harness key="one" initial={['alpha']} />);
    expect(combobox()).toHaveValue('Alpha');

    rerender(<Harness key="two" initial={['alpha', 'zulu']} />);
    expect(combobox()).toHaveValue('Alpha +1');

    rerender(<Harness key="unknown" initial={['missing', 'other']} />);
    expect(combobox()).toHaveValue('2 selected');
  });

  it('exposes combobox and listbox semantics', () => {
    render(<Harness />);
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');

    openList();

    const listbox = screen.getByRole('listbox', { name: 'Project:' });
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    expect(combobox()).toHaveAttribute('aria-controls', listbox.id);
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    expect(combobox()).toHaveAttribute('placeholder', 'Search projects');
  });

  it('lists selected options first, then the rest alphabetically', () => {
    render(<Harness initial={['zulu']} />);
    openList();

    expect(screen.getByText('Selected (1)')).toBeInTheDocument();
    expect(optionLabels()).toEqual(['Zulu', 'AlphaAcme', 'Beta']);
    expect(optionNamed('Zulu')).toHaveAttribute('aria-selected', 'true');
  });

  it('toggles an option in place, keeps the list open and reports the full selection', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    openList();
    const before = optionLabels();

    fireEvent.click(optionNamed('Beta'));

    expect(onChange).toHaveBeenLastCalledWith(['beta']);
    expect(optionLabels()).toEqual(before);
    expect(optionNamed('Beta')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.click(optionNamed('Alpha'));
    expect(onChange).toHaveBeenLastCalledWith(['beta', 'alpha']);

    fireEvent.click(optionNamed('Beta'));
    expect(onChange).toHaveBeenLastCalledWith(['alpha']);
    expect(optionLabels()).toEqual(before);
  });

  it('regroups only when the list opens again', () => {
    render(<Harness />);
    openList();
    fireEvent.click(optionNamed('Zulu'));
    expect(optionLabels()[0]).toBe('AlphaAcme');

    fireEvent.keyDown(combobox(), { key: 'Escape' });
    openList();

    expect(optionLabels()[0]).toBe('Zulu');
    expect(screen.getByText('Selected (1)')).toBeInTheDocument();
  });

  it('puts options without data in a muted group and updates their values in place', () => {
    const meta = (values: Record<string, MultiSearchOptionMeta>): Record<string, MultiSearchOptionMeta> => values;
    const { rerender } = render(
      <Harness
        optionMeta={meta({
          alpha: { trailing: '05:00' },
          beta: { trailing: '—', inactive: true },
          zulu: { trailing: '01:30' },
        })}
        inactiveGroupLabel="No hours"
      />,
    );
    openList();

    expect(optionLabels()).toEqual(['AlphaAcme05:00', 'Zulu01:30', 'Beta—']);
    expect(screen.getByText('No hours')).toBeInTheDocument();

    rerender(
      <Harness
        optionMeta={meta({
          alpha: { trailing: '—', inactive: true },
          beta: { trailing: '02:00' },
          zulu: { trailing: '01:30' },
        })}
        inactiveGroupLabel="No hours"
      />,
    );

    expect(optionLabels()).toEqual(['AlphaAcme—', 'Zulu01:30', 'Beta02:00']);
  });

  it('collapses archived options without data and finds them by search', () => {
    const items = [...ITEMS, option('Archived Project', 'archived', { archivedStatus: true })];
    render(<Harness items={items} />);
    openList();

    expect(screen.queryByText('Archived Project')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Archived \(1\)/ }));
    expect(optionNamed('Archived Project')).toHaveTextContent('Archived');

    fireEvent.keyDown(combobox(), { key: 'Escape' });
    openList();
    fireEvent.change(combobox(), { target: { value: 'archived' } });
    expect(optionLabels()).toEqual(['Archived ProjectArchived']);
  });

  it('keeps archived options that have data in the main group', () => {
    const items = [...ITEMS, option('Archived Project', 'archived', { archivedStatus: true })];
    render(<Harness items={items} optionMeta={{ archived: { trailing: '03:00' } }} />);
    openList();

    expect(screen.queryByRole('button', { name: /Archived \(/ })).not.toBeInTheDocument();
    expect(optionNamed('Archived Project')).toHaveTextContent('03:00');
  });

  it('filters by label or e-mail and selects all unselected matches', () => {
    const onChange = vi.fn();
    render(<Harness initial={['zulu']} onChange={onChange} />);
    openList();

    fireEvent.change(combobox(), { target: { value: 'beta@' } });
    expect(optionLabels()).toEqual(['Beta']);

    fireEvent.change(combobox(), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select 2 matching' }));
    expect(onChange).toHaveBeenLastCalledWith(['zulu', 'alpha', 'beta']);

    fireEvent.change(combobox(), { target: { value: 'nothing' } });
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('supports keyboard navigation without trapping Tab', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combobox().focus();

    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(combobox()).toHaveAttribute('aria-activedescendant', optionNamed('Alpha').id);

    fireEvent.keyDown(combobox(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['alpha']);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(combobox(), { key: 'End' });
    fireEvent.keyDown(combobox(), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(['alpha', 'zulu']);

    fireEvent.keyDown(combobox(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox()).toHaveFocus();

    openList();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      combobox().dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clears the selection from the label row', () => {
    const onChange = vi.fn();
    render(<Harness initial={['alpha']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('calls onOpen every time the list opens', () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);

    openList();
    fireEvent.keyDown(combobox(), { key: 'Escape' });
    openList();

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('stays closed and unchanged when read-only', () => {
    const onChange = vi.fn();
    render(<Harness readOnly initial={['alpha']} onChange={onChange} />);

    openList();
    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('distinguishes an empty catalogue from a search without results', () => {
    render(<Harness items={[]} emptyItemsMessage="No projects yet" />);
    openList();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });

  it('appends options that arrive while the list is open', () => {
    const { rerender } = render(<Harness items={ITEMS.slice(0, 2)} />);
    openList();
    expect(optionLabels()).toEqual(['Beta', 'Zulu']);

    rerender(<Harness items={ITEMS} />);

    expect(optionLabels()).toEqual(['Beta', 'Zulu', 'AlphaAcme']);
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3);
  });
});

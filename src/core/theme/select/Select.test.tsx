import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Select from './Select';

describe('Select accessibility', () => {
  it('associates its visible label with the internal input through the supplied name', () => {
    render(
      <Select
        items={[{ label: 'Project One', value: 'project-1' }]}
        label="PM Project"
        name="pmProjectId"
        onSelect={vi.fn()}
        selectedItem={{ label: 'Project One', value: 'project-1' }}
      />,
    );

    const input = screen.getByLabelText('PM Project');
    expect(input).toHaveAttribute('id', 'pmProjectId');
    expect(input).toHaveAttribute('name', 'pmProjectId');
  });
});

it('lets Tab and Shift+Tab leave the Select while its menu is open', async () => {
  const user = userEvent.setup();
  render(
    <>
      <button>Before</button>
      <Select items={[{ label: 'B2B', value: 'B2B' }]} label="Cooperation" name="cooperation" onSelect={vi.fn()} />
      <button>Save</button>
    </>,
  );
  await user.click(screen.getByLabelText('Cooperation'));
  await user.tab();
  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByLabelText('Cooperation')).toHaveFocus();
  await user.click(screen.getByLabelText('Cooperation'));
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
});

const options = [
  { label: 'Change', value: 'change' },
  { label: 'Correction', value: 'correct' },
];

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

it('exposes its expanded listbox and selected option with unique IDs', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Select label="Save mode" name="saveMode" items={options} selectedItem={options[0]} />
      <Select label="Other mode" name="otherMode" items={options} />
    </>,
  );
  const first = screen.getByRole('combobox', { name: 'Save mode' });
  expect(first).toHaveAttribute('aria-expanded', 'false');
  expect(first).toHaveAttribute('aria-haspopup', 'listbox');
  expect(first).not.toHaveAttribute('aria-controls');
  await user.click(first);
  const firstListId = screen.getByRole('listbox', { name: 'Save mode' }).getAttribute('id');
  expect(first).toHaveAttribute('aria-controls', firstListId);
  expect(first).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('option', { name: 'Change' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('option', { name: 'Correction' })).toHaveAttribute('aria-selected', 'false');
  await user.click(screen.getByRole('combobox', { name: 'Other mode' }));
  expect(screen.getByRole('listbox', { name: 'Other mode' })).not.toHaveAttribute('id', firstListId);
});

it('announces the highlighted option and selects it using arrows and Enter', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onValueChange = vi.fn();
  render(<Select label="Mode" name="mode" items={options} onSelect={onSelect} onValueChange={onValueChange} />);
  const input = screen.getByRole('combobox', { name: 'Mode' });
  input.focus();
  await user.keyboard('{ArrowDown}{ArrowDown}');
  expect(input).toHaveAttribute(
    'aria-activedescendant',
    screen.getByRole('option', { name: 'Correction' }).getAttribute('id'),
  );
  await user.keyboard('{Enter}');
  expect(onSelect).toHaveBeenCalledWith(options[1]);
  expect(onValueChange).toHaveBeenCalledWith(options[1]);
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(input).not.toHaveAttribute('aria-activedescendant');
});

it.each(['readOnly', 'loading'] as const)('blocks mouse and keyboard changes while %s', async (state) => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onValueChange = vi.fn();
  render(
    <Select
      label="Mode"
      name="mode"
      items={options}
      onSelect={onSelect}
      onValueChange={onValueChange}
      {...{ [state]: true }}
    />,
  );
  const input = screen.getByRole('combobox', { name: 'Mode' });
  expect(input).toHaveAttribute('aria-disabled', 'true');
  await user.click(input);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
  expect(onValueChange).not.toHaveBeenCalled();
});

it('closes an open menu if it becomes read-only and does not reopen when enabled again', async () => {
  const user = userEvent.setup();
  const view = render(<Select label="Mode" name="mode" items={options} />);
  await user.click(screen.getByRole('combobox'));
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  view.rerender(<Select label="Mode" name="mode" items={options} readOnly />);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  view.rerender(<Select label="Mode" name="mode" items={options} />);
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
});

it('uses Escape to close the popup without forwarding it to a containing dialog', async () => {
  const user = userEvent.setup();
  const parentKeyDown = vi.fn();
  render(
    <div onKeyDown={parentKeyDown}>
      <Select label="Mode" name="mode" items={options} />
    </div>,
  );
  const input = screen.getByRole('combobox');
  await user.click(input);
  await user.keyboard('{Escape}');
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(input).not.toHaveAttribute('aria-activedescendant');
  expect(parentKeyDown).not.toHaveBeenCalled();
});

it('does not reference a nonexistent option or invoke a callback when there are no items', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<Select label="Mode" name="mode" items={[]} onSelect={onSelect} />);
  const input = screen.getByRole('combobox');
  input.focus();
  await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
  expect(input).not.toHaveAttribute('aria-activedescendant');
  expect(onSelect).not.toHaveBeenCalled();
});

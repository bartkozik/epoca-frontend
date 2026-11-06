import type { ChangeEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SelectOption } from '../inputs/types';
import Search from './Search';

const renderSearch = (items: SelectOption[]): void => {
  render(
    <Search
      emptyItemsMessage="All users added"
      noResultsMessage="No matching users"
      items={items}
      name="User search"
      placeholder="Search users"
      onSelect={vi.fn()}
    />,
  );
};

describe('Search', () => {
  it('shows the empty-items message when opened without items', () => {
    renderSearch([]);

    fireEvent.click(screen.getByRole('textbox'));

    expect(screen.getByText('All users added')).toBeInTheDocument();
    expect(screen.queryByText('No matching users')).not.toBeInTheDocument();
  });

  it('shows the no-results message when a query has no matches', () => {
    renderSearch([{ label: 'Anna Kowalska', value: 'user-1' }]);

    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'missing' } });

    expect(screen.getByText('No matching users')).toBeInTheDocument();
    expect(screen.queryByText('All users added')).not.toBeInTheDocument();
  });

  it('shows matching options without an empty-state message', () => {
    renderSearch([{ label: 'Anna Kowalska', value: 'user-1' }]);

    fireEvent.click(screen.getByRole('textbox'));

    expect(screen.getByText('Anna Kowalska')).toBeInTheDocument();
    expect(screen.queryByText('All users added')).not.toBeInTheDocument();
    expect(screen.queryByText('No matching users')).not.toBeInTheDocument();
  });

  it('forwards input changes while filtering with the updated query', () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLInputElement>) => void>();

    render(
      <Search
        items={[
          { label: 'Adam Jankowski', value: 'user-1' },
          { label: 'Anna Kowalska', value: 'user-2' },
        ]}
        name="User search"
        onChange={onChange}
        onSelect={vi.fn()}
        placeholder="Search users"
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'Adam' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe('Adam');
    expect(screen.getByText('Adam Jankowski')).toBeInTheDocument();
    expect(screen.queryByText('Anna Kowalska')).not.toBeInTheDocument();
  });

  it('opens the dropdown on typing, without a prior click', () => {
    renderSearch([{ label: 'Anna Kowalska', value: 'user-1' }]);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Anna' } });

    expect(screen.getByText('Anna Kowalska')).toBeInTheDocument();
  });

  it('does not close the dropdown when clicking back into an already-open input', () => {
    renderSearch([{ label: 'Anna Kowalska', value: 'user-1' }]);

    const input = screen.getByRole('textbox');
    fireEvent.click(input);
    expect(screen.getByText('Anna Kowalska')).toBeInTheDocument();

    fireEvent.click(input);
    expect(screen.getByText('Anna Kowalska')).toBeInTheDocument();
  });

  it('closes the dropdown after selecting an item, without it bubbling back open', () => {
    const onSelect = vi.fn();
    render(
      <Search
        items={[{ label: 'Anna Kowalska', value: 'user-1' }]}
        name="User search"
        onSelect={onSelect}
        placeholder="Search users"
      />,
    );

    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.click(screen.getByText('Anna Kowalska'));

    expect(onSelect).toHaveBeenCalledWith({ label: 'Anna Kowalska', value: 'user-1' });
    expect(screen.queryByText('Anna Kowalska')).not.toBeInTheDocument();
  });

  it('shows items that arrive after mount, once the items prop updates', () => {
    const { rerender } = render(
      <Search
        emptyItemsMessage="No clients"
        items={[]}
        name="Client search"
        onSelect={vi.fn()}
        placeholder="Search clients"
      />,
    );

    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.getByText('No clients')).toBeInTheDocument();

    rerender(
      <Search
        emptyItemsMessage="No clients"
        items={[{ label: 'Acme', value: 'client-1' }]}
        name="Client search"
        onSelect={vi.fn()}
        placeholder="Search clients"
      />,
    );

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('No clients')).not.toBeInTheDocument();
  });

  it('keeps a multi-selected item hidden when the items prop resyncs to an array that already excludes it', () => {
    const onSelect = vi.fn();
    const items = [
      { label: 'Anna Kowalska', value: 'user-1' },
      { label: 'Adam Jankowski', value: 'user-2' },
    ];

    const { rerender } = render(
      <Search multiple items={items} name="User search" onSelect={onSelect} placeholder="Search users" />,
    );

    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.click(screen.getByText('Anna Kowalska'));
    expect(onSelect).toHaveBeenCalledWith({ label: 'Anna Kowalska', value: 'user-1' });

    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.queryByText('Anna Kowalska')).not.toBeInTheDocument();
    expect(screen.getByText('Adam Jankowski')).toBeInTheDocument();

    rerender(
      <Search
        multiple
        items={[{ label: 'Adam Jankowski', value: 'user-2' }]}
        name="User search"
        onSelect={onSelect}
        placeholder="Search users"
      />,
    );

    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.queryByText('Anna Kowalska')).not.toBeInTheDocument();
    expect(screen.getByText('Adam Jankowski')).toBeInTheDocument();
  });

  it('re-shows a multi-selected item if the items prop resyncs to a new-identity array that still contains it', () => {
    const onSelect = vi.fn();
    const items = [
      { label: 'Anna Kowalska', value: 'user-1' },
      { label: 'Adam Jankowski', value: 'user-2' },
    ];

    const { rerender } = render(
      <Search multiple items={items} name="User search" onSelect={onSelect} placeholder="Search users" />,
    );

    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.click(screen.getByText('Anna Kowalska'));
    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.queryByText('Anna Kowalska')).not.toBeInTheDocument();

    rerender(<Search multiple items={[...items]} name="User search" onSelect={onSelect} placeholder="Search users" />);

    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.getByText('Anna Kowalska')).toBeInTheDocument();
  });
});

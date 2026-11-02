import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDropdownKeyboardNavigation } from './useDropdownKeyboardNavigation';

const DropdownKeyboardNavigationHarness = ({ nativeTab = false }: { nativeTab?: boolean }): JSX.Element => {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedOption, setSelectedOption] = useState('');
  const optionRefs = useRef<(HTMLDivElement | HTMLLIElement | null)[]>([]);
  const { handleInputKeyDown, highlightedIndex, resetHighlightedIndex } = useDropdownKeyboardNavigation({
    showOptions: isOpen,
    setShowOptions: setIsOpen,
    onOptionSelect: setSelectedOption,
    searchedOptionsWithTitles: ['Alpha', 'Beta'],
    optionRefs,
    nativeTab,
  });

  return (
    <>
      <input aria-label="Dropdown input" onKeyDown={handleInputKeyDown} />
      <button type="button" onClick={resetHighlightedIndex}>
        Reset highlight
      </button>
      <output aria-label="Highlighted index">{highlightedIndex}</output>
      <output aria-label="Menu state">{String(isOpen)}</output>
      <output aria-label="Selected option">{selectedOption}</output>
    </>
  );
};

describe('useDropdownKeyboardNavigation', () => {
  it('resets the highlighted index when requested', () => {
    render(<DropdownKeyboardNavigationHarness />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' });
    expect(screen.getByLabelText('Highlighted index')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: 'Reset highlight' }));
    expect(screen.getByLabelText('Highlighted index')).toHaveTextContent('-1');
  });

  it('selects the highlighted option and closes the menu on Enter', () => {
    render(<DropdownKeyboardNavigationHarness />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(screen.getByLabelText('Selected option')).toHaveTextContent('Alpha');
    expect(screen.getByLabelText('Menu state')).toHaveTextContent('false');
  });

  it('selects the highlighted option and consumes Tab by default', () => {
    render(<DropdownKeyboardNavigationHarness />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(false);
    expect(screen.getByLabelText('Selected option')).toHaveTextContent('Alpha');
    expect(screen.getByLabelText('Menu state')).toHaveTextContent('false');
  });

  it('does not consume Tab or Shift+Tab for an opted-in native Tab dropdown', () => {
    render(<DropdownKeyboardNavigationHarness nativeTab />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true);
    expect(screen.getByLabelText('Menu state')).toHaveTextContent('false');
    expect(screen.getByLabelText('Selected option')).toHaveTextContent('');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(screen.getByLabelText('Menu state')).toHaveTextContent('false');
  });
});

import { KeyboardEvent, MutableRefObject, useCallback, useEffect, useState } from 'react';

interface UseDropdownKeyboardNavigationProps<T> {
  showOptions: boolean;
  setShowOptions: (value: boolean) => void;
  onOptionSelect: (option: T) => void;
  searchedOptionsWithTitles: T[];
  optionRefs: MutableRefObject<(HTMLDivElement | HTMLLIElement | null)[]>;
  nativeTab?: boolean;
}

interface DropdownKeyboardNavigationReturn {
  handleInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLDivElement>) => void;
  highlightedIndex: number;
  resetHighlightedIndex: () => void;
}

export const useDropdownKeyboardNavigation = <T>({
  showOptions,
  setShowOptions,
  onOptionSelect,
  searchedOptionsWithTitles,
  optionRefs,
  nativeTab = false,
}: UseDropdownKeyboardNavigationProps<T>): DropdownKeyboardNavigationReturn => {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const resetHighlightedIndex = useCallback((): void => {
    setHighlightedIndex(-1);
  }, []);

  useEffect(() => {
    // Plain `new Array(length)` uses the `ArrayConstructor` overload that always returns `any[]`
    // (only the spread-items overload infers an element type) -- the explicit type argument
    // selects the generic overload instead, so the result is typed to match `optionRefs.current`.
    optionRefs.current = new Array<HTMLDivElement | HTMLLIElement | null>(searchedOptionsWithTitles.length).fill(null);
  }, [searchedOptionsWithTitles.length]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLDivElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!showOptions) {
          setShowOptions(true);
        }
        setHighlightedIndex((prev) => (prev + 1) % searchedOptionsWithTitles.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!showOptions) {
          setShowOptions(true);
        }
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchedOptionsWithTitles.length - 1));
        break;
      case 'Enter':
      case 'Tab':
        if (event.key === 'Tab' && nativeTab) {
          setShowOptions(false);
          resetHighlightedIndex();
          break;
        }
        event.preventDefault();
        if (showOptions && highlightedIndex !== -1) {
          const selectedOption = searchedOptionsWithTitles[highlightedIndex];
          if (selectedOption) {
            onOptionSelect(selectedOption);
            setShowOptions(false);
          }
        } else {
          setShowOptions(true);
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        setShowOptions(false);
        break;
    }
  };

  return { handleInputKeyDown, highlightedIndex, resetHighlightedIndex };
};

export default useDropdownKeyboardNavigation;

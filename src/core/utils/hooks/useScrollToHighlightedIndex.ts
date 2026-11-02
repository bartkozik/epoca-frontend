import { MutableRefObject, useEffect } from 'react';

interface UseScrollToHighlightedIndexProps {
  highlightedIndex: number;
  showOptions: boolean;
  optionRefs: MutableRefObject<(HTMLDivElement | HTMLLIElement | null)[]>;
}

export const useScrollToHighlightedIndex = ({
  highlightedIndex,
  showOptions,
  optionRefs,
}: UseScrollToHighlightedIndexProps): void => {
  useEffect(() => {
    if (showOptions && highlightedIndex >= 0) {
      const element = optionRefs.current[highlightedIndex];
      if (element) {
        element.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
        });
      }
    }
  }, [highlightedIndex, showOptions, optionRefs]);
};

export default useScrollToHighlightedIndex;

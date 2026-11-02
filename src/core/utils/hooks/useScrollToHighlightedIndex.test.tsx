import { renderHook } from '@testing-library/react';
import { useScrollToHighlightedIndex } from './useScrollToHighlightedIndex';

describe('useScrollToHighlightedIndex', () => {
  it('scrolls the highlighted option into view without queuing an animation', () => {
    const option = document.createElement('li');
    const scrollIntoView = vi.fn();
    option.scrollIntoView = scrollIntoView;

    renderHook(() =>
      useScrollToHighlightedIndex({
        highlightedIndex: 0,
        showOptions: true,
        optionRefs: { current: [option] },
      }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
    });
  });
});

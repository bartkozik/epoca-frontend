import { useEffect } from 'react';

export enum KeyBoardEventType {
  ENTER = 'Enter',
  ESC = 'Escape',
  TAB = 'Tab',
  AR_LEFT = 'ArrowLeft',
  AR_RIGHT = 'ArrowRight',
}

interface UseKeyDownParams {
  keyboardEventType: KeyBoardEventType;
  action: () => void;
  isListening: boolean;
  options?: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  };
}

export function useKeyDown({ keyboardEventType, action, isListening, options }: UseKeyDownParams): void {
  useEffect(() => {
    if (!isListening) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      // Native KeyboardEvent.key is a plain string; KeyBoardEventType's members are the real
      // DOM key-name strings (e.g. 'Enter', 'Escape'), so a match only ever fires for a genuine
      // key of that name -- casting here just makes the comparison provable to `tsc`.
      if ((event.key as KeyBoardEventType) === keyboardEventType) {
        const isCtrlKeyMatching = options?.ctrlKey === undefined || event.ctrlKey === options.ctrlKey;
        const isShiftKeyMatching = options?.shiftKey === undefined || event.shiftKey === options.shiftKey;
        const isAltKeyMatching = options?.altKey === undefined || event.altKey === options.altKey;

        if (isCtrlKeyMatching && isShiftKeyMatching && isAltKeyMatching) {
          action();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [keyboardEventType, action, isListening, options]);
}

export default useKeyDown;

import { RefObject, useCallback, useEffect, useRef } from 'react';

type UseOnClickOutsideProps = {
  ref: RefObject<HTMLElement> | RefObject<HTMLElement>[];
  handler: () => void;
  condition?: boolean;
};

export const useOnClickOutside = ({ ref, handler, condition = true }: UseOnClickOutsideProps): void => {
  const shouldHandle = useRef<boolean>(condition);

  const handleClickOutside = useCallback(
    (event: MouseEvent): void => {
      if (shouldHandle.current === true) {
        if (ref) {
          if (Array.isArray(ref)) {
            let shouldRunHandler = true;

            for (const refElement of ref) {
              if (refElement.current && refElement.current.contains(event.target as Node)) {
                shouldRunHandler = false;
                break;
              }
            }

            if (shouldRunHandler) handler();
          } else {
            if (ref.current && !ref.current.contains(event.target as Node)) handler();
          }
        }
      }
    },
    [ref, handler],
  );

  useEffect(() => {
    shouldHandle.current = condition;
  }, [condition]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  });
};

export default useOnClickOutside;

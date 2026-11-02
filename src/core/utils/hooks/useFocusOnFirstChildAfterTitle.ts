import { RefObject, useEffect } from 'react';

interface UseFocusOnFirstChildAfterTitleProps {
  childRef: RefObject<HTMLInputElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  parentRef: RefObject<HTMLFormElement | HTMLDivElement | null>;
  shouldCheckParentNode?: boolean;
}

export const useFocusOnFirstChildAfterTitle = ({
  childRef,
  wrapperRef,
  parentRef,
  shouldCheckParentNode = false,
}: UseFocusOnFirstChildAfterTitleProps): void => {
  useEffect(() => {
    if (childRef.current && parentRef.current && wrapperRef.current) {
      const isFirstChildAfterTitle = shouldCheckParentNode
        ? wrapperRef.current === parentRef.current.parentNode?.childNodes[1]
        : wrapperRef.current === parentRef.current.childNodes[1];

      if (isFirstChildAfterTitle) {
        childRef.current.focus();
      }
    }
  }, [childRef.current, wrapperRef.current]);
};

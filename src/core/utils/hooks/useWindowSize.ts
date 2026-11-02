import { useEffect, useState } from 'react';
import { debounce } from 'lodash';

const delay = 100;
const getWindowSize = (): [number, number] =>
  typeof window === 'undefined' ? [0, 0] : [window.innerWidth, window.innerHeight];

export default function useWindowSize(): [number, number] {
  const [size, setSize] = useState<[number, number]>(getWindowSize);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const debouncedResizeHandler = debounce(() => {
      setSize(getWindowSize());
    }, delay);

    setSize(getWindowSize());
    window.addEventListener('resize', debouncedResizeHandler);

    return () => {
      debouncedResizeHandler.cancel();
      window.removeEventListener('resize', debouncedResizeHandler);
    };
  }, []);

  return size;
}

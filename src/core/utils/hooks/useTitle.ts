import { useEffect } from 'react';

export function useTitle(title: string): void {
  useEffect(() => {
    if (!title) return;
    const prevTitle = document.title;
    document.title = `Epoca — ${title}`;

    return () => {
      document.title = prevTitle;
    };
  });
}

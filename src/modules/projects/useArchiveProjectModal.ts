import { useState } from 'react';

export interface ArchiveProjectModalState<T> {
  projectToArchive: T | null;
  isOpen: boolean;
  openArchiveModal: (project: T) => void;
  closeArchiveModal: () => void;
}

export function useArchiveProjectModal<T>(): ArchiveProjectModalState<T> {
  const [projectToArchive, setProjectToArchive] = useState<T | null>(null);

  return {
    projectToArchive,
    isOpen: projectToArchive !== null,
    openArchiveModal: setProjectToArchive,
    closeArchiveModal: () => setProjectToArchive(null),
  };
}

import { act, renderHook } from '@testing-library/react';
import { useArchiveProjectModal } from './useArchiveProjectModal';

describe('useArchiveProjectModal', () => {
  it('starts closed with no project to archive', () => {
    const { result } = renderHook(() => useArchiveProjectModal<{ id: string }>());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.projectToArchive).toBeNull();
  });

  it('opens with the given project and derives isOpen from it', () => {
    const { result } = renderHook(() => useArchiveProjectModal<{ id: string }>());

    act(() => result.current.openArchiveModal({ id: 'project-1' }));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.projectToArchive).toEqual({ id: 'project-1' });
  });

  it('closes and clears the selected project', () => {
    const { result } = renderHook(() => useArchiveProjectModal<{ id: string }>());

    act(() => result.current.openArchiveModal({ id: 'project-1' }));
    act(() => result.current.closeArchiveModal());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.projectToArchive).toBeNull();
  });
});

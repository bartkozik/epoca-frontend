import { Project } from '../types';
import { ProjectFormSchema } from './projectForm.model';

const existingProject = { id: 'project-1', name: 'Website Revamp' } as Project;

describe('ProjectFormSchema', () => {
  it('accepts a unique, valid project name', () => {
    const result = ProjectFormSchema([existingProject]).safeParse({ projectName: 'New Project' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty project name with the required-field key', () => {
    const result = ProjectFormSchema([existingProject]).safeParse({ projectName: '' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('projects.project_form.error.project_name_required');
  });

  it('rejects a project name too long with the too-long key', () => {
    const result = ProjectFormSchema([existingProject]).safeParse({ projectName: 'a'.repeat(300) });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('projects.project_form.error.project_name_too_long');
  });

  it('rejects a project name already in use by another project', () => {
    const result = ProjectFormSchema([existingProject]).safeParse({ projectName: 'website revamp' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('common.error.name_is_already_in_use');
  });

  it('allows the current project to keep its own name when editing', () => {
    const result = ProjectFormSchema([existingProject], 'project-1').safeParse({ projectName: 'Website Revamp' });
    expect(result.success).toBe(true);
  });
});

import { WorkUnitEntryType } from '../types';
import {
  createAddUnitSignature,
  createEditUnitSignature,
  createSubmissionSignature,
  WorkUnitSubmission,
  WorkUnitSubmissionIdentity,
} from './WorkUnitSubmissionIdentity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const baseSubmission: WorkUnitSubmission = {
  organizationSlug: 'acme',
  method: 'POST',
  target: '/organizations/acme/work-units',
  payload: {
    projectId: 'project-1',
    date: '2026-07-28',
    duration: '08:00',
    description: 'Implementation',
    taskId: 'CT-514',
    isDraft: false,
    shouldFinalize: false,
  },
};

describe('createSubmissionSignature', () => {
  it('normalizes omitted and undefined optional payload fields to the same ordered null model', () => {
    const withOmittedFields = createSubmissionSignature({
      organizationSlug: 'acme',
      method: 'POST',
      target: '/organizations/acme/work-units',
      payload: {
        projectId: 'project-1',
      },
    });
    const withUndefinedFields = createSubmissionSignature({
      organizationSlug: 'acme',
      method: 'POST',
      target: '/organizations/acme/work-units',
      payload: {
        projectId: 'project-1',
        entryType: undefined,
        date: undefined,
        duration: undefined,
        description: undefined,
        taskId: undefined,
        isDraft: undefined,
        shouldFinalize: undefined,
      },
    });

    expect(withUndefinedFields).toBe(withOmittedFields);
    expect(withOmittedFields).toBe(
      JSON.stringify({
        version: 1,
        organizationSlug: 'acme',
        method: 'POST',
        target: '/organizations/acme/work-units',
        payload: {
          projectId: 'project-1',
          entryType: null,
          date: null,
          duration: null,
          description: null,
          taskId: null,
          isDraft: null,
          shouldFinalize: null,
        },
      }),
    );
  });

  it.each([
    ['organization slug', { organizationSlug: 'other-organization' }],
    ['HTTP method', { method: 'PATCH' as const }],
    ['target', { target: '/organizations/acme/work-units/unit-1' }],
  ])('changes when the %s changes', (_, changedSubmission) => {
    expect(createSubmissionSignature({ ...baseSubmission, ...changedSubmission })).not.toBe(
      createSubmissionSignature(baseSubmission),
    );
  });

  it.each([
    ['projectId', 'project-2'],
    ['entryType', WorkUnitEntryType.Note],
    ['date', '2026-07-29'],
    ['duration', '07:30'],
    ['description', 'Different work'],
    ['taskId', 'CT-515'],
    ['isDraft', true],
    ['shouldFinalize', true],
  ])('changes when payload.%s changes', (field, value) => {
    expect(
      createSubmissionSignature({
        ...baseSubmission,
        payload: { ...baseSubmission.payload, [field]: value },
      }),
    ).not.toBe(createSubmissionSignature(baseSubmission));
  });
});

describe('WorkUnitSubmissionIdentity', () => {
  it('returns the same UUID for repeated calls with an identical signature', () => {
    const identity = new WorkUnitSubmissionIdentity();
    const signature = createSubmissionSignature(baseSubmission);

    const firstKey = identity.keyFor(signature);

    expect(identity.keyFor(signature)).toBe(firstKey);
  });

  it.each([
    ['organization slug', { organizationSlug: 'other-organization' }],
    ['HTTP method', { method: 'PATCH' as const }],
    ['target', { target: '/organizations/acme/work-units/unit-1' }],
  ])('returns a new UUID when the %s changes', (_, changedSubmission) => {
    const identity = new WorkUnitSubmissionIdentity();
    const originalKey = identity.keyFor(createSubmissionSignature(baseSubmission));
    const changedKey = identity.keyFor(createSubmissionSignature({ ...baseSubmission, ...changedSubmission }));

    expect(changedKey).not.toBe(originalKey);
  });

  it.each([
    ['projectId', 'project-2'],
    ['entryType', WorkUnitEntryType.Note],
    ['date', '2026-07-29'],
    ['duration', '07:30'],
    ['description', 'Different work'],
    ['taskId', 'CT-515'],
    ['isDraft', true],
    ['shouldFinalize', true],
  ])('returns a new UUID when payload.%s changes', (field, value) => {
    const identity = new WorkUnitSubmissionIdentity();
    const originalKey = identity.keyFor(createSubmissionSignature(baseSubmission));
    const changedKey = identity.keyFor(
      createSubmissionSignature({
        ...baseSubmission,
        payload: { ...baseSubmission.payload, [field]: value },
      }),
    );

    expect(changedKey).not.toBe(originalKey);
  });

  it('returns a new UUID for the same signature after clear', () => {
    const identity = new WorkUnitSubmissionIdentity();
    const signature = createSubmissionSignature(baseSubmission);
    const firstKey = identity.keyFor(signature);

    identity.clear();

    expect(identity.keyFor(signature)).not.toBe(firstKey);
  });

  it('generates a UUID v4 key', () => {
    const identity = new WorkUnitSubmissionIdentity();

    expect(identity.keyFor(createSubmissionSignature(baseSubmission))).toMatch(UUID_REGEX);
  });
});

describe('submission signature factories', () => {
  it('creates a stable POST signature for add and draft submissions', () => {
    const dto = {
      entryType: WorkUnitEntryType.Worklog,
      projectId: 'project-1',
      date: '2026-07-28',
      duration: '08:00',
      description: 'Implementation',
      taskId: 'CT-514',
    };

    const signature = createAddUnitSignature('acme', dto, true);

    expect(createAddUnitSignature('acme', dto, true)).toBe(signature);
    expect(JSON.parse(signature)).toMatchObject({
      method: 'POST',
      target: '/organizations/acme/work-units',
      payload: { isDraft: true, shouldFinalize: null },
    });
  });

  it('changes the POST signature when the entry type changes', () => {
    const dto = {
      projectId: 'project-1',
      date: '2026-07-28',
      description: 'Administrative entry',
    };

    expect(createAddUnitSignature('acme', { ...dto, entryType: WorkUnitEntryType.Worklog }, false)).not.toBe(
      createAddUnitSignature('acme', { ...dto, entryType: WorkUnitEntryType.Note }, false),
    );
  });

  it('creates a stable PATCH signature whose target contains the concrete work unit ID', () => {
    const dto = {
      projectId: 'project-1',
      date: '2026-07-28',
      duration: '08:00',
      description: 'Implementation',
      taskId: 'CT-514',
    };

    const signature = createEditUnitSignature('acme', 'unit-1', dto, true);

    expect(createEditUnitSignature('acme', 'unit-1', dto, true)).toBe(signature);
    expect(JSON.parse(signature)).toMatchObject({
      method: 'PATCH',
      target: '/organizations/acme/work-units/unit-1',
      payload: { isDraft: null, shouldFinalize: true },
    });
    expect(createEditUnitSignature('acme', 'unit-2', dto, true)).not.toBe(signature);
  });
});

import { bootstrapWorkingTime } from './bootstrapWorkingTime';
import type { WorkingTimeBootstrapOptions } from './bootstrapWorkingTime';

const readyOptions = (): WorkingTimeBootstrapOptions => ({
  contextOrganizationSlug: 'epoca-e2e',
  fetchWorkingTimeData: vi.fn(),
  isContextOrganizationSlugInLocalStorage: true,
  loggedInUserId: 'owner-id',
});

describe('bootstrapWorkingTime', () => {
  it.each([
    ['anonymous user', { loggedInUserId: undefined }],
    ['missing context marker', { isContextOrganizationSlugInLocalStorage: false }],
    ['missing organization slug', { contextOrganizationSlug: '' }],
  ])('does not fetch working-time data for an incomplete %s', (_label, overrides) => {
    const options = { ...readyOptions(), ...overrides };

    bootstrapWorkingTime(options);

    expect(options.fetchWorkingTimeData).not.toHaveBeenCalled();
  });

  it('fetches working-time data once the logged-in user and organization context are known', () => {
    const options = readyOptions();

    bootstrapWorkingTime(options);

    expect(options.fetchWorkingTimeData).toHaveBeenCalledTimes(1);
  });
});

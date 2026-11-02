export interface WorkingTimeBootstrapOptions {
  contextOrganizationSlug: string;
  fetchWorkingTimeData: () => void;
  isContextOrganizationSlugInLocalStorage: boolean;
  loggedInUserId?: string;
}

export const bootstrapWorkingTime = ({
  contextOrganizationSlug,
  fetchWorkingTimeData,
  isContextOrganizationSlugInLocalStorage,
  loggedInUserId,
}: WorkingTimeBootstrapOptions): void => {
  if (!loggedInUserId || !isContextOrganizationSlugInLocalStorage || !contextOrganizationSlug) return;

  fetchWorkingTimeData();
};

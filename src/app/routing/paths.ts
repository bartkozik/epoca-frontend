import { workingTimePaths } from '@/modules/workingTime/routes';

// The only path owned by the app layer rather than a feature module: where an authenticated user
// lands by default. Other modules import this alias instead of reaching into workingTime directly
// (module -> app is an allowed boundary edge; module -> module mostly isn't).
export const paths = {
  index: workingTimePaths.main,
};

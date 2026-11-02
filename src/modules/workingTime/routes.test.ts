import { workingTimePaths, workingTimeRoutes } from './routes';

describe('workingTimeRoutes', () => {
  it('exposes the index path', () => {
    expect(workingTimePaths.main).toBe('/working-time');
  });

  it('defines exactly one route', () => {
    expect(workingTimeRoutes).toHaveLength(1);
    expect(workingTimeRoutes[0].path).toBe(workingTimePaths.main);
  });
});

import { workspaceSelectPaths, workspaceSelectRoutes } from './routes';

describe('workspaceSelectRoutes', () => {
  it('exposes the workspace-select path', () => {
    expect(workspaceSelectPaths.main).toBe('/select-organization');
  });

  it('defines exactly one route for the workspace-select page', () => {
    expect(workspaceSelectRoutes).toHaveLength(1);
    expect(workspaceSelectRoutes[0].path).toBe(workspaceSelectPaths.main);
  });
});

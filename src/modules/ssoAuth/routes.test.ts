import { ssoAuthPaths, ssoAuthRoutes } from './routes';

describe('ssoAuthRoutes', () => {
  it('exposes the loginSSO path', () => {
    expect(ssoAuthPaths.loginSSO).toBe('/login-sso');
  });

  it('defines exactly one route', () => {
    expect(ssoAuthRoutes).toHaveLength(1);
    expect(ssoAuthRoutes[0].path).toBe(ssoAuthPaths.loginSSO);
  });
});

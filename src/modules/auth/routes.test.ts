import { authPaths, authRoutes } from './routes';

describe('authRoutes', () => {
  it('exposes auth paths', () => {
    expect(authPaths.login).toBe('/login');
    expect(authPaths.passwordReset).toBe('/password-reset');
    expect(authPaths.passwordNew).toBe('/password-new');
    expect(authPaths.signup).toBe('/signup');
  });

  it('defines 4 routes, one per auth page', () => {
    expect(authRoutes).toHaveLength(4);
  });

  it('maps each auth path to its own route, in order', () => {
    expect(authRoutes.map((route) => route.path)).toEqual([
      authPaths.login,
      authPaths.passwordReset,
      authPaths.passwordNew,
      authPaths.signup,
    ]);
  });
});

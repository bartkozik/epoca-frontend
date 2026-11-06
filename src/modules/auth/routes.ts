import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const Login = lazy(() => import('./login/Login'));
const PasswordReset = lazy(() => import('./passwordReset/PasswordReset'));
const PasswordNew = lazy(() => import('./passwordNew/PasswordNew'));
const InvitationAccess = lazy(() => import('./invitationAccess/InvitationAccess'));
const InvitationSignIn = lazy(() => import('./invitationAccess/InvitationSignIn'));
const Signup = lazy(() => import('./signup/Signup'));

export const authPaths = {
  login: '/login',
  invitationAccept: '/invitations/accept',
  invitationSignIn: '/invitations/sign-in',
  passwordReset: '/password-reset',
  passwordNew: '/password-new',
  signup: '/signup',
} as const;

export const authRoutes: RouteObject[] = [
  { path: authPaths.login, Component: Login },
  { path: authPaths.passwordReset, Component: PasswordReset },
  { path: authPaths.passwordNew, Component: PasswordNew },
  { path: authPaths.signup, Component: Signup },
];

export const invitationAccessRoutes: RouteObject[] = [
  { path: authPaths.invitationAccept, Component: InvitationAccess },
  { path: authPaths.invitationSignIn, Component: InvitationSignIn },
];

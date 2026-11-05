import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';
import { getUserLanguageFromLS, removeUserLanguageFromLS, saveUserLanguageInLS } from './utils';

const mode = vi.hoisted(() => ({ isDemo: false }));
vi.mock('@/core/config/demo', () => ({
  get isDemo() {
    return mode.isDemo;
  },
}));

beforeEach(() => {
  localStorage.clear();
  mode.isDemo = false;
});

afterEach(() => localStorage.clear());

it('keeps the regular application language preference unchanged', () => {
  saveUserLanguageInLS('pl');
  expect(getUserLanguageFromLS()).toBe('pl');
  expect(localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE)).toBe('pl');
  removeUserLanguageFromLS();
  expect(getUserLanguageFromLS()).toBeNull();
});

it('defaults a demo to English despite an older application preference', () => {
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE, 'pl');
  mode.isDemo = true;
  expect(getUserLanguageFromLS()).toBe('en');
  expect(localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE)).toBe('pl');
});

it('remembers explicit demo language changes without changing the regular application preference', () => {
  saveUserLanguageInLS('en');
  mode.isDemo = true;
  saveUserLanguageInLS('pl');
  expect(getUserLanguageFromLS()).toBe('pl');
  mode.isDemo = false;
  expect(getUserLanguageFromLS()).toBe('en');
  mode.isDemo = true;
  expect(getUserLanguageFromLS()).toBe('pl');
  saveUserLanguageInLS('en');
  expect(getUserLanguageFromLS()).toBe('en');
});

it('falls back to English when the demo preference is removed', () => {
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE, 'pl');
  mode.isDemo = true;
  saveUserLanguageInLS('pl');
  removeUserLanguageFromLS();
  expect(getUserLanguageFromLS()).toBe('en');
  expect(localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE)).toBe('pl');
});

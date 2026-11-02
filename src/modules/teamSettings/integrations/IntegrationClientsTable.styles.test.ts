/* eslint-disable testing-library/no-node-access -- CSS cascade verification requires production ancestry/classes. */
import { readFileSync } from 'fs';
import type { IntegrationClient } from '@/modules/integrationClients/types';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compile } from 'sass';
import IntegrationClientsTable from './IntegrationClientsTable';

vi.mock('./IntegrationClientsTable.module.scss', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}));
vi.mock('@/core/theme/button/Button.module.scss', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'team_seatings.integrations.heading') return 'Integration clients';
      if (key === 'team_seatings.integrations.count') return `${String(values?.count ?? '')} integration clients`;
      return key.split('.').at(-1) ?? key;
    },
  }),
}));

const sassOptions = { loadPaths: ['src'], logger: { warn: () => undefined } };
const globalTableCss = compile('src/core/theme/theme-style.scss', sassOptions).css;
const buttonCss = compile('src/core/theme/button/Button.module.scss', { loadPaths: ['src'] }).css;
const tableCss = compile('src/modules/teamSettings/integrations/IntegrationClientsTable.module.scss', {
  loadPaths: ['src'],
}).css;
const MOBILE_VIEWPORT_WIDTH = 320;
const LONGEST_POLISH_STATUS = 'Unieważniony';
const FULL_CLIENT_ID = 'integration-client-1234567890';

const mediaMatches = (condition: string, viewportWidth: number): boolean => {
  if (/\bprint\b/.test(condition)) return false;
  const maxWidth = condition.match(/max-width:\s*(\d+)px/);
  const minWidth = condition.match(/min-width:\s*(\d+)px/);
  return (!maxWidth || viewportWidth <= Number(maxWidth[1])) && (!minWidth || viewportWidth >= Number(minWidth[1]));
};

const activeCssAt = (css: string, viewportWidth: number): string => {
  const parser = document.createElement('style');
  parser.textContent = css;
  document.head.appendChild(parser);
  const activeRules: string[] = [];

  const visitRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule instanceof CSSMediaRule) {
        if (mediaMatches(rule.media.mediaText, viewportWidth)) visitRules(rule.cssRules);
        return;
      }
      if (rule instanceof CSSStyleRule) activeRules.push(rule.cssText);
    });
  };

  visitRules((parser.sheet as CSSStyleSheet).cssRules);
  parser.remove();
  return activeRules.join('\n');
};

const installProductionStyles = (viewportWidth: number): HTMLStyleElement => {
  const style = document.createElement('style');
  style.textContent = [globalTableCss, buttonCss, tableCss].map((css) => activeCssAt(css, viewportWidth)).join('\n');
  document.head.appendChild(style);
  return style;
};

const px = (value: string): number => Number(value.replace('px', ''));

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Client owner',
};
const createClient = (status: IntegrationClient['status']): IntegrationClient => ({
  clientId: FULL_CLIENT_ID,
  name: 'Mobile client',
  status,
  scopes: ['projects:read'],
  projectAccess: { mode: 'AllProjects' },
  version: 1,
  policyVersion: 1,
  secretVersion: 1,
  serviceAccount: actor,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: actor,
  modifiedAt: '2026-01-01T00:00:00Z',
  modifiedBy: actor,
  secretRotatedAt: '2026-01-01T00:00:00Z',
  secretRotatedBy: actor,
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
});

describe('IntegrationClientsTable mobile production styles', () => {
  let productionStyles: HTMLStyleElement;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: MOBILE_VIEWPORT_WIDTH });
    productionStyles = installProductionStyles(MOBILE_VIEWPORT_WIDTH);
  });

  afterEach(() => {
    cleanup();
    productionStyles.remove();
  });

  it('keeps the full client id accessible while hiding only its shortened visual value', () => {
    render(createElement(IntegrationClientsTable, { clients: [createClient('Revoked')], count: 1, locale: 'pl-PL' }));

    const fullClientId = screen.getByText(FULL_CLIENT_ID);
    const shortenedClientId = screen.getByText('integrat…7890');
    expect(fullClientId).toHaveClass('visuallyHidden');
    expect(fullClientId).toBeVisible();
    expect(shortenedClientId).toHaveClass('clientIdVisual');
    expect(shortenedClientId).toHaveAttribute('aria-hidden', 'true');
    expect(getComputedStyle(shortenedClientId).display).toBe('none');
    expect(screen.getAllByText(FULL_CLIENT_ID)).toHaveLength(1);
    expect(screen.getByRole('row', { name: new RegExp(FULL_CLIENT_ID) })).toBeInTheDocument();
  });

  it('keeps the real retained columns and an accessible action menu reachable at 320px', async () => {
    const user = userEvent.setup();
    render(
      createElement(IntegrationClientsTable, {
        clients: [createClient('Active')],
        count: 1,
        locale: 'pl-PL',
        onDetails: vi.fn(),
        onEdit: vi.fn(),
        onRevoke: vi.fn(),
        onRotate: vi.fn(),
      }),
    );

    const table = screen.getByRole('table', { name: 'Integration clients' });
    const headers = within(table).getAllByRole('columnheader', { hidden: true });
    const scroll = table.parentElement;
    if (!scroll) throw new Error('Integration clients table must have a scroll container');
    const row = screen.getByRole('row', { name: new RegExp(FULL_CLIENT_ID) });
    const cells = within(row).getAllByRole('cell', { hidden: true });
    expect(cells).toHaveLength(5);
    const status = within(row).getByText('Active');
    const statusDot = status.querySelector('.statusDot');
    const actionTrigger = within(row).getByRole('button', { name: 'actions: Mobile client' });
    if (!statusDot) throw new Error('Production status class bindings must be present');

    expect(scroll).toHaveClass('tableScroll');
    expect(table).toHaveClass('table', 'tableCustom');
    expect(getComputedStyle(scroll).overflowX).toBe('auto');
    expect(getComputedStyle(scroll).maxWidth).toBe('100%');
    expect(px(getComputedStyle(table).minWidth)).toBeGreaterThan(window.innerWidth);
    expect(getComputedStyle(table).width).toBe('100%');
    expect(getComputedStyle(table).borderCollapse).toBe('collapse');
    expect(getComputedStyle(table).tableLayout).toBe('fixed');
    expect(getComputedStyle(table).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(headers[0]).paddingLeft).toBe('22px');
    expect(getComputedStyle(headers[4]).paddingRight).toBe('22px');

    expect(getComputedStyle(cells[0]).display).not.toBe('none');
    expect(getComputedStyle(cells[1]).display).not.toBe('none');
    expect(getComputedStyle(cells[2]).display).toBe('none');
    expect(getComputedStyle(cells[3]).display).toBe('none');
    expect(getComputedStyle(cells[4]).display).not.toBe('none');

    const statusStyle = getComputedStyle(status);
    const statusCellStyle = getComputedStyle(cells[1]);
    const statusTextSpace =
      px(statusCellStyle.width) -
      px(statusCellStyle.paddingLeft) -
      px(statusCellStyle.paddingRight) -
      px(getComputedStyle(statusDot).width) -
      px(statusStyle.gap);
    expect(statusStyle.display).toBe('inline-flex');
    expect(statusStyle.whiteSpace).toBe('nowrap');
    expect(statusDot).toHaveAttribute('aria-hidden', 'true');
    expect(status).toHaveTextContent('Active');
    expect(statusTextSpace).toBeGreaterThanOrEqual(
      Array.from(LONGEST_POLISH_STATUS).length * px(statusStyle.fontSize) * 0.65,
    );

    const actionCellStyle = getComputedStyle(cells[4]);
    expect(actionCellStyle.display).toBe('table-cell');
    expect(actionTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(within(row).getByLabelText('details: Mobile client')).toHaveAttribute('tabindex', '-1');
    await user.click(actionTrigger);
    expect(actionTrigger).toHaveAttribute('aria-expanded', 'true');
    const menu = within(row).getByRole('group', { name: 'actions: Mobile client' });
    const details = within(row).getByRole('button', { name: 'details: Mobile client' });
    const buttonStyle = getComputedStyle(details);
    expect(details).toHaveAttribute('tabindex', '0');
    expect(actionCellStyle.overflow).toBe('visible');
    expect(getComputedStyle(menu).visibility).toBe('visible');
    expect(buttonStyle.whiteSpace).toBe('nowrap');
    expect(px(buttonStyle.minHeight)).toBeGreaterThanOrEqual(44);
    expect(details).toBeVisible();
    await user.click(details);
    expect(actionTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(actionTrigger).toHaveFocus();
    expect(buttonCss).toMatch(/\.root:focus-visible[\s\S]*?outline:\s*2px solid[^;]+;/);
    expect(buttonCss).toMatch(/\.root:focus-visible[\s\S]*?outline-offset:\s*2px;/);
  });

  it('uses theme tokens rather than a duplicated mobile palette', () => {
    const source = readFileSync('src/modules/teamSettings/integrations/IntegrationClientsTable.module.scss', 'utf8');

    expect(source).toMatch(/@use 'core\/theme\//);
    expect(source).toContain('$color-border-active');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});

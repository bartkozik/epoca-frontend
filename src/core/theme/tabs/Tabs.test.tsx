import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import Tabs, { Tab } from './Tabs';

let mockViewportWidth = 1200;

vi.mock('@/core/utils/hooks/useWindowSize', () => ({
  __esModule: true,
  default: () => [mockViewportWidth, 800],
}));
vi.mock('./Tabs.module.scss', () => ({
  __esModule: true,
  default: {
    content: 'content',
    detailsOptions: 'detailsOptions',
    headline: 'headline',
    root: 'root',
    screenXsMax: '767px',
    selected: 'selected',
  },
}));

const tabs: Tab[] = [
  { value: 'first', label: 'First', element: <div>First panel</div> },
  { value: 'second', label: 'Second', element: <div>Second panel</div> },
  { value: 'third', label: 'Third', element: <div>Third panel</div> },
];

const renderTabs = (
  path = '/settings/second',
  currentTabs = tabs,
  onTabClick = vi.fn(),
): ReturnType<typeof render> & { onTabClick: Mock } => {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/:tab" element={<Tabs onTabClick={onTabClick} tabs={currentTabs} />} />
        <Route path="/settings" element={<Tabs onTabClick={onTabClick} tabs={currentTabs} />} />
      </Routes>
    </MemoryRouter>,
  );

  return { ...view, onTabClick };
};

describe('Tabs', () => {
  it('supports inline horizontal tabs on desktop without changing the default layout', async () => {
    mockViewportWidth = 1200;
    render(
      <MemoryRouter>
        <Tabs tabs={tabs} layout="inline" ariaLabel="Snapshots" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tablist', { name: 'Snapshots' })).toHaveAttribute('aria-orientation', 'horizontal');
    screen.getByRole('tab', { name: 'First' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second panel');
  });
  beforeEach(() => {
    mockViewportWidth = 1200;
  });

  it('links every tab to a stable persistent panel without mounting inactive content', () => {
    const view = renderTabs();
    const renderedTabs = screen.getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    const ids = renderedTabs.map((tab) => tab.id);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(new Set(ids)).toHaveProperty('size', renderedTabs.length);
    expect(panels).toHaveLength(renderedTabs.length);
    panels.forEach((panel, index) => {
      expect(panel).toHaveAttribute('id', renderedTabs[index].getAttribute('aria-controls'));
      expect(panel).toHaveAttribute('aria-labelledby', renderedTabs[index].id);
    });
    expect(panels[0]).not.toBeVisible();
    expect(panels[0]).toBeEmptyDOMElement();
    expect(panels[1]).toBeVisible();
    expect(panels[1]).toHaveTextContent('Second panel');
    expect(panels[2]).not.toBeVisible();
    expect(panels[2]).toBeEmptyDOMElement();

    view.rerender(
      <MemoryRouter initialEntries={['/settings/second']}>
        <Routes>
          <Route path="/settings/:tab" element={<Tabs tabs={tabs} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('tab').map((tab) => tab.id)).toEqual(ids);
  });

  it('moves focus from the selected tab into the active panel with Tab', async () => {
    const user = userEvent.setup();
    renderTabs();
    const selectedTab = screen.getByRole('tab', { name: 'Second' });
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    selectedTab.focus();

    await user.tab();

    expect(panels[1]).toHaveFocus();
    expect(panels[1]).toHaveAttribute('tabindex', '0');
    expect(panels[0]).toHaveAttribute('tabindex', '-1');
    expect(panels[2]).toHaveAttribute('tabindex', '-1');
  });

  it('exposes one selected native button and a roving tab stop', () => {
    renderTabs();
    const renderedTabs = screen.getAllByRole('tab');

    expect(renderedTabs).toHaveLength(3);
    expect(renderedTabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toEqual([renderedTabs[1]]);
    expect(renderedTabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(renderedTabs.every((tab) => tab.tagName === 'BUTTON' && tab.getAttribute('type') === 'button')).toBe(true);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second panel');
  });

  it('activates a tab on click', async () => {
    const user = userEvent.setup();
    const { onTabClick } = renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Third' }));

    expect(onTabClick).toHaveBeenCalledWith('third');
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Third panel');
  });

  it('uses vertical orientation and consumes only Up/Down on desktop', () => {
    const { onTabClick } = renderTabs();
    const selectedTab = screen.getByRole('tab', { name: 'Second' });
    selectedTab.focus();

    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    expect(fireEvent.keyDown(selectedTab, { key: 'ArrowLeft' })).toBe(true);
    expect(fireEvent.keyDown(selectedTab, { key: 'ArrowRight' })).toBe(true);
    expect(selectedTab).toHaveFocus();
    expect(onTabClick).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(selectedTab, { key: 'ArrowDown' })).toBe(false);
    const thirdTab = screen.getByRole('tab', { name: 'Third' });
    expect(thirdTab).toHaveFocus();
    expect(thirdTab).toHaveAttribute('aria-selected', 'true');
    expect(onTabClick).toHaveBeenCalledWith('third');
  });

  it('uses horizontal orientation and consumes only Left/Right on mobile', () => {
    mockViewportWidth = 320;
    const { onTabClick } = renderTabs();
    const selectedTab = screen.getByRole('tab', { name: 'Second' });
    selectedTab.focus();

    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
    expect(fireEvent.keyDown(selectedTab, { key: 'ArrowUp' })).toBe(true);
    expect(fireEvent.keyDown(selectedTab, { key: 'ArrowDown' })).toBe(true);
    expect(selectedTab).toHaveFocus();
    expect(onTabClick).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(selectedTab, { key: 'ArrowRight' })).toBe(false);
    const thirdTab = screen.getByRole('tab', { name: 'Third' });
    expect(thirdTab).toHaveFocus();
    expect(thirdTab).toHaveAttribute('aria-selected', 'true');
    expect(onTabClick).toHaveBeenCalledWith('third');
  });

  it.each([
    [767, 'horizontal'],
    [768, 'vertical'],
  ])('uses the shared screen-xs boundary at %s px', (width, orientation) => {
    mockViewportWidth = width;
    renderTabs();

    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', orientation);
  });

  it.each([
    [1200, 'vertical'],
    [320, 'horizontal'],
  ])('supports Home and End in %s px %s orientation', (width, orientation) => {
    mockViewportWidth = width;
    renderTabs();
    const selectedTab = screen.getByRole('tab', { name: 'Second' });
    selectedTab.focus();

    expect(fireEvent.keyDown(selectedTab, { key: 'Home' })).toBe(false);
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();

    expect(fireEvent.keyDown(screen.getByRole('tab', { name: 'First' }), { key: 'End' })).toBe(false);
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus();
  });

  it.each([
    [1200, 'ArrowUp', 'ArrowDown'],
    [320, 'ArrowLeft', 'ArrowRight'],
  ])('wraps %s px orientation navigation at both ends', (width, previousKey, nextKey) => {
    mockViewportWidth = width;
    renderTabs('/settings/first');
    const firstTab = screen.getByRole('tab', { name: 'First' });
    firstTab.focus();

    expect(fireEvent.keyDown(firstTab, { key: previousKey })).toBe(false);
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus();

    expect(fireEvent.keyDown(screen.getByRole('tab', { name: 'Third' }), { key: nextKey })).toBe(false);
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();
  });

  it.each(['/settings/unknown', '/settings'])('falls back safely to the first tab for route %s', (path) => {
    renderTabs(path);

    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('First panel');
  });

  it.each([
    [1200, 'ArrowDown', 'ArrowRight'],
    [320, 'ArrowRight', 'ArrowDown'],
  ])('keeps a single tab selected and keyboard-safe at %s px', (width, handledKey, unhandledKey) => {
    mockViewportWidth = width;
    renderTabs('/settings/only', [{ value: 'only', label: 'Only', element: <div>Only panel</div> }]);
    const onlyTab = screen.getByRole('tab', { name: 'Only' });
    onlyTab.focus();

    expect(fireEvent.keyDown(onlyTab, { key: unhandledKey })).toBe(true);
    expect(fireEvent.keyDown(onlyTab, { key: handledKey })).toBe(false);
    expect(fireEvent.keyDown(onlyTab, { key: 'Home' })).toBe(false);
    expect(fireEvent.keyDown(onlyTab, { key: 'End' })).toBe(false);

    expect(onlyTab).toHaveFocus();
    expect(onlyTab).toHaveAttribute('aria-selected', 'true');
    expect(onlyTab).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Only panel');
  });
});

it('preserves form values in inactive panels when keepMounted is enabled', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Tabs
        layout="inline"
        keepMounted
        tabs={[
          { value: 'first', label: 'First', element: <input aria-label="Draft" defaultValue="" /> },
          { value: 'second', label: 'Second', element: <p>Second panel</p> },
        ]}
      />
    </MemoryRouter>,
  );
  await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Unsaved contract');
  await user.click(screen.getByRole('tab', { name: 'Second' }));
  expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved contract');
  await user.click(screen.getByRole('tab', { name: 'First' }));
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Unsaved contract');
});

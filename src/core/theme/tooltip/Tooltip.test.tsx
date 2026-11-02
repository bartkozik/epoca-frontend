import { MouseEventHandler, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tooltip from './Tooltip';

const INITIAL_INNER_WIDTH = window.innerWidth;

const getTooltip = (): HTMLElement => screen.getByRole('tooltip', { hidden: true });

const renderTooltip = (
  options: {
    ariaDescribedBy?: string;
    content?: ReactNode;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    placement?: 'bottom' | 'top';
    tabIndex?: number;
  } = {},
): void => {
  const { ariaDescribedBy, content = 'Helpful information', onClick, placement, tabIndex } = options;

  render(
    <Tooltip content={content} placement={placement}>
      <button aria-describedby={ariaDescribedBy} onClick={onClick} tabIndex={tabIndex}>
        Trigger
      </button>
    </Tooltip>,
  );
};

describe('Tooltip', () => {
  it('optionally fits above or below the trigger at viewport edges', async () => {
    const user = userEvent.setup();
    let rootTop = 250;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
      const tooltip = this.getAttribute('role') === 'tooltip';
      const top = tooltip ? 0 : rootTop;
      const height = tooltip ? 180 : 20;
      return { top, bottom: top + height, height, width: 200, left: 20, right: 220, x: 20, y: top, toJSON: () => ({}) };
    });
    render(
      <Tooltip content="Long audit details" fitViewport>
        <button>Trigger</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'Trigger' }));
    expect(getTooltip()).toHaveAttribute('data-placement', 'top');
    rootTop = 4;
    fireEvent(window, new Event('scroll'));
    expect(getTooltip()).toHaveAttribute('data-placement', 'bottom');
    expect(getTooltip()).toHaveClass('fitViewport');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
  });
  it('reports actual hover, focus, touch and closed visibility for lazy content', async () => {
    const user = userEvent.setup();
    const onVisibilityChange = vi.fn();
    render(
      <Tooltip content="Lazy" onVisibilityChange={onVisibilityChange}>
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.hover(trigger);
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
    await user.unhover(trigger);
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    await user.tab();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    await user.pointer([
      { keys: '[TouchA>]', target: trigger },
      { keys: '[/TouchA]', target: trigger },
    ]);
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: INITIAL_INNER_WIDTH });
  });

  it('connects each trigger to its own generated tooltip id', () => {
    render(
      <>
        <Tooltip content="First tooltip">
          <button>First trigger</button>
        </Tooltip>
        <Tooltip content="Second tooltip">
          <button>Second trigger</button>
        </Tooltip>
      </>,
    );

    const firstTrigger = screen.getByRole('button', { name: 'First trigger' });
    const secondTrigger = screen.getByRole('button', { name: 'Second trigger' });
    const tooltips = screen.getAllByRole('tooltip', { hidden: true });

    expect(tooltips[0]).toHaveAttribute('id');
    expect(tooltips[1]).toHaveAttribute('id');
    expect(tooltips[0].id).not.toBe(tooltips[1].id);
    expect(firstTrigger).toHaveAttribute('aria-describedby', tooltips[0].id);
    expect(secondTrigger).toHaveAttribute('aria-describedby', tooltips[1].id);
  });

  it('preserves an existing aria-describedby value and appends its generated id', () => {
    renderTooltip({ ariaDescribedBy: 'existing-description' });

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const tooltip = getTooltip();

    expect(trigger).toHaveAttribute('aria-describedby', `existing-description ${tooltip.id}`);
  });

  it('preserves an explicit trigger tabIndex', () => {
    renderTooltip({ tabIndex: -1 });

    expect(screen.getByRole('button', { name: 'Trigger' })).toHaveAttribute('tabindex', '-1');
  });

  it('opens on hover and closes when unhovered while focus is outside', async () => {
    const user = userEvent.setup();
    renderTooltip();

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const tooltip = getTooltip();

    await user.hover(trigger);
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');

    await user.unhover(trigger);
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('opens on focus and stays open when unhovered while focus remains inside', async () => {
    const user = userEvent.setup();
    renderTooltip();

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const tooltip = getTooltip();

    await user.hover(trigger);
    await user.tab();
    await user.unhover(trigger);

    expect(trigger).toHaveFocus();
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
  });

  it('closes when focus moves outside the tooltip root', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Helpful information">
          <button>Trigger</button>
        </Tooltip>
        <button>Outside</button>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const outside = screen.getByRole('button', { name: 'Outside' });

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(getTooltip()).toHaveAttribute('aria-hidden', 'false');

    await user.tab();

    expect(outside).toHaveFocus();
    expect(getTooltip()).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the tooltip open and focuses the trigger on first and repeated clicks', async () => {
    const user = userEvent.setup();
    renderTooltip();

    const trigger = screen.getByRole('button', { name: 'Trigger' });

    await user.click(trigger);
    expect(getTooltip()).toHaveAttribute('aria-hidden', 'false');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(getTooltip()).toHaveAttribute('aria-hidden', 'false');
    expect(trigger).toHaveFocus();
  });

  it('focuses the trigger and calls its original click handler once per click', async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();
    const onClick = vi.fn<MouseEventHandler<HTMLButtonElement>>((event) => {
      expect(event.currentTarget).toHaveFocus();
      event.stopPropagation();
    });
    render(
      <div onClick={onParentClick}>
        <Tooltip content="Helpful information">
          <button onClick={onClick}>Trigger</button>
        </Tooltip>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(screen.getByRole('button', { name: 'Trigger' }));

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onParentClick).not.toHaveBeenCalled();
    expect(getTooltip()).toHaveAttribute('aria-hidden', 'false');
  });

  it('closes after an outside pointer interaction and stays open after an inside interaction', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Helpful information">
          <button>Trigger</button>
        </Tooltip>
        <button>Outside</button>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const outside = screen.getByRole('button', { name: 'Outside' });

    await user.click(trigger);
    await user.pointer([
      { keys: '[MouseLeft>]', target: trigger },
      { keys: '[/MouseLeft]', target: trigger },
    ]);
    expect(getTooltip()).toHaveAttribute('aria-hidden', 'false');

    await user.pointer([
      { keys: '[MouseLeft>]', target: outside },
      { keys: '[/MouseLeft]', target: outside },
    ]);
    expect(outside).toHaveFocus();
    expect(getTooltip()).toHaveAttribute('aria-hidden', 'true');
  });

  it('closes on Escape without moving focus, bubbling, or allowing the default action', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <Tooltip content="Helpful information">
          <button>Trigger</button>
        </Tooltip>
      </div>,
    );

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(trigger).toHaveFocus();
    expect(onKeyDown).not.toHaveBeenCalled();

    await user.click(trigger);
    const dispatchResult = fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(getTooltip()).toHaveAttribute('aria-hidden', 'true');
    expect(dispatchResult).toBe(false);
  });

  it('uses bottom placement by default and updates the placement when rerendered', () => {
    const { rerender } = render(
      <Tooltip content="Helpful information">
        <button>Trigger</button>
      </Tooltip>,
    );

    expect(getTooltip()).toHaveAttribute('data-placement', 'bottom');

    rerender(
      <Tooltip content="Helpful information" placement="top">
        <button>Trigger</button>
      </Tooltip>,
    );

    expect(getTooltip()).toHaveAttribute('data-placement', 'top');
  });

  it('corrects the horizontal offset in a narrow viewport and resets it on resize', async () => {
    const user = userEvent.setup();
    let rootLeft = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect(
      this: HTMLElement,
    ): DOMRect {
      if (this.getAttribute('role') === 'tooltip') {
        return { bottom: 0, height: 0, left: 0, right: 80, top: 0, width: 80, x: 0, y: 0, toJSON: () => ({}) };
      }

      return {
        bottom: 0,
        height: 20,
        left: rootLeft,
        right: rootLeft + 20,
        top: 0,
        width: 20,
        x: rootLeft,
        y: 0,
        toJSON: () => ({}),
      };
    });

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 100 });
    renderTooltip();
    await user.click(screen.getByRole('button', { name: 'Trigger' }));

    expect(getTooltip()).toHaveStyle('--tooltip-horizontal-offset: 42px');

    rootLeft = 260;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    fireEvent(window, new Event('resize'));

    expect(getTooltip()).toHaveStyle('--tooltip-horizontal-offset: -22px');

    rootLeft = 140;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: INITIAL_INNER_WIDTH });
    fireEvent(window, new Event('resize'));

    expect(getTooltip()).toHaveStyle('--tooltip-horizontal-offset: 0px');
  });

  it('remeasures the horizontal offset when open content changes', async () => {
    const user = userEvent.setup();
    let tooltipWidth = 80;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect(
      this: HTMLElement,
    ): DOMRect {
      if (this.getAttribute('role') === 'tooltip') {
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: tooltipWidth,
          top: 0,
          width: tooltipWidth,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      }

      return {
        bottom: 0,
        height: 20,
        left: 100,
        right: 120,
        top: 0,
        width: 20,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      };
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    const { rerender } = render(
      <Tooltip content="Short">
        <button>Trigger</button>
      </Tooltip>,
    );

    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(getTooltip()).toHaveStyle('--tooltip-horizontal-offset: 0px');

    tooltipWidth = 240;
    rerender(
      <Tooltip content="Long content that changes the tooltip width">
        <button>Trigger</button>
      </Tooltip>,
    );

    expect(getTooltip()).toHaveStyle('--tooltip-horizontal-offset: 22px');
  });
});

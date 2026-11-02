import { useRef, type CSSProperties } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import { usePivotMatrixDocks } from './usePivotMatrixDocks';

const domRect = (input: {
  bottom: number;
  height?: number;
  left?: number;
  right?: number;
  top: number;
  width?: number;
}): DOMRect => {
  const { bottom, top } = input;
  const left = input.left ?? 0;
  const width = input.width ?? 0;
  const height = input.height ?? bottom - top;
  const right = input.right ?? left + width;
  return {
    bottom,
    height,
    left,
    right,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
};

const emptyRect = domRect({ bottom: 0, top: 0 });

function Fixture({
  bottomInset = 0,
  grandTotalClearance = 0,
  rowFieldsSticky = true,
}: {
  bottomInset?: number;
  grandTotalClearance?: number;
  rowFieldsSticky?: boolean;
}): JSX.Element {
  const grandTotalDockRef = useRef<HTMLDivElement>(null);
  const grandTotalDockRowHeaderRef = useRef<HTMLTableCellElement>(null);
  const grandTotalDockTableRef = useRef<HTMLTableElement>(null);
  const headerDockRef = useRef<HTMLDivElement>(null);
  const headerDockTableRef = useRef<HTMLTableElement>(null);
  const horizontalContainerRef = useRef<HTMLDivElement>(null);
  const masterToggleRef = useRef<HTMLButtonElement>(null);
  const matrixShellRef = useRef<HTMLDivElement>(null);
  const semanticGrandTotalRef = useRef<HTMLTableRowElement>(null);
  const semanticHeaderRef = useRef<HTMLTableSectionElement>(null);
  const semanticMasterAnchorRef = useRef<HTMLTableCellElement>(null);
  const semanticTableRef = useRef<HTMLTableElement>(null);
  const verticalScrollContainerRef = useRef<HTMLDivElement>(null);

  usePivotMatrixDocks({
    grandTotalDockRef,
    grandTotalDockRowHeaderRef,
    grandTotalDockTableRef,
    headerDockRef,
    headerDockTableRef,
    horizontalContainerRef,
    masterToggleRef,
    matrixShellRef,
    rowFieldsSticky,
    semanticGrandTotalRef,
    semanticHeaderRef,
    semanticMasterAnchorRef,
    semanticTableRef,
    verticalScrollContainerRef,
  });

  return (
    <div data-testid="scroller" ref={verticalScrollContainerRef}>
      <div
        data-testid="shell"
        ref={matrixShellRef}
        style={
          {
            '--pivot-grand-total-clearance': `${grandTotalClearance}px`,
            '--pivot-sticky-bottom-inset': `${bottomInset}px`,
          } as CSSProperties
        }
      >
        <div data-testid="horizontal" ref={horizontalContainerRef}>
          <table data-testid="semantic-table" ref={semanticTableRef}>
            <thead data-testid="semantic-header" ref={semanticHeaderRef}>
              <tr>
                <th data-testid="semantic-master-anchor" ref={semanticMasterAnchorRef}>
                  Header
                </th>
              </tr>
            </thead>
            <tbody>
              <tr data-testid="semantic-total" ref={semanticGrandTotalRef}>
                <th>Total</th>
              </tr>
            </tbody>
          </table>
        </div>
        <button data-testid="master-toggle" ref={masterToggleRef} type="button">
          Toggle all
        </button>
        <div data-testid="header-dock" ref={headerDockRef}>
          <table data-testid="header-dock-table" ref={headerDockTableRef}>
            <thead>
              <tr>
                <th data-pivot-dock-row-header="true" data-testid="header-dock-row-field">
                  Header
                </th>
              </tr>
            </thead>
          </table>
        </div>
        <div data-testid="grand-total-dock" ref={grandTotalDockRef}>
          <table data-testid="grand-total-dock-table" ref={grandTotalDockTableRef}>
            <tbody>
              <tr>
                <th data-testid="grand-total-dock-row-field" ref={grandTotalDockRowHeaderRef}>
                  Total
                </th>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

describe('usePivotMatrixDocks', () => {
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let rects: Record<string, DOMRect>;
  let disconnectResizeObserver: Mock;
  let requestAnimationFrameMock: Mock;
  let cancelAnimationFrameMock: Mock;

  const flushFrame = (): void => {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    act(() => callbacks.forEach((callback) => callback(0)));
  };

  beforeEach(() => {
    nextFrameId = 1;
    frameCallbacks = new Map();
    rects = {
      horizontal: domRect({ bottom: 800, left: 20, right: 520, top: 0, width: 500 }),
      'semantic-header': domRect({ bottom: 88, top: 0 }),
      'semantic-master-anchor': domRect({ bottom: 88, left: 21, right: 197, top: 0, width: 176 }),
      'semantic-table': domRect({ bottom: 800, top: 0 }),
      'semantic-total': domRect({ bottom: 800, top: 752 }),
      shell: domRect({ bottom: 800, top: 0 }),
      scroller: domRect({ bottom: 700, top: 100 }),
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rects[this.dataset.testid ?? ''] ?? emptyRect;
    });
    vi.spyOn(HTMLElement.prototype, 'clientLeft', 'get').mockReturnValue(1);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(498);

    requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frameCallbacks.set(id, callback);
      return id;
    });
    cancelAnimationFrameMock = vi.fn((id: number) => frameCallbacks.delete(id));
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: requestAnimationFrameMock,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrameMock,
    });

    disconnectResizeObserver = vi.fn();
    // A regular `function` (not an arrow function) is required here: `window.ResizeObserver` is
    // invoked with `new`, and arrow functions aren't constructible.
    window.ResizeObserver = vi.fn(function MockResizeObserver() {
      return {
        disconnect: disconnectResizeObserver,
        observe: vi.fn(),
        unobserve: vi.fn(),
      };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('positions both docks against the outer scroller and synchronizes horizontal movement', () => {
    render(<Fixture bottomInset={120} />);
    flushFrame();

    const headerDock = screen.getByTestId('header-dock');
    const grandTotalDock = screen.getByTestId('grand-total-dock');
    const horizontal = screen.getByTestId('horizontal');
    const headerTable = screen.getByTestId('header-dock-table');
    const headerRowField = screen.getByTestId('header-dock-row-field');
    const grandTotalTable = screen.getByTestId('grand-total-dock-table');
    const grandTotalRowField = screen.getByTestId('grand-total-dock-row-field');

    expect(headerDock).toHaveAttribute('data-mode', 'sticky');
    expect(headerDock).toHaveStyle({
      left: '21px',
      position: 'fixed',
      top: '100px',
      visibility: 'visible',
      width: '498px',
    });
    expect(grandTotalDock).toHaveAttribute('data-docked', 'true');
    expect(grandTotalDock).toHaveStyle({
      left: '21px',
      position: 'fixed',
      top: '532px',
      visibility: 'visible',
      width: '498px',
    });
    expect(screen.getByTestId('master-toggle')).toHaveStyle({
      left: '25px',
      position: 'fixed',
      top: '128px',
      visibility: 'visible',
    });

    horizontal.scrollLeft = 128;
    fireEvent.scroll(horizontal);
    flushFrame();
    expect(headerTable).toHaveStyle({ transform: 'translateX(-128px)' });
    expect(headerRowField).toHaveStyle({ transform: 'translateX(128px)' });
    expect(grandTotalTable).toHaveStyle({ transform: 'translateX(-128px)' });
    expect(grandTotalRowField).toHaveStyle({ transform: 'translateX(128px)' });

    rects['semantic-total'] = domRect({ bottom: 580, top: 532 });
    rects['semantic-table'] = domRect({ bottom: 580, top: -220 });
    fireEvent.scroll(screen.getByTestId('scroller'));
    flushFrame();
    expect(grandTotalDock).toHaveAttribute('data-docked', 'false');
    expect(grandTotalDock).toHaveStyle({ visibility: 'hidden' });

    rects['semantic-header'] = domRect({ bottom: 150, top: 62 });
    rects['semantic-master-anchor'] = domRect({ bottom: 150, left: 21, right: 197, top: 62, width: 176 });
    rects['semantic-table'] = domRect({ bottom: 150, top: -650 });
    fireEvent.scroll(screen.getByTestId('scroller'));
    flushFrame();
    expect(headerDock).toHaveAttribute('data-mode', 'boundary');
    expect(screen.getByTestId('master-toggle')).toHaveStyle({ top: '90px' });
  });

  it('remeasures when an export inset makes the same matrix long', () => {
    rects['semantic-header'] = domRect({ bottom: 248, top: 160 });
    rects['semantic-master-anchor'] = domRect({ bottom: 248, left: 21, right: 197, top: 160, width: 176 });
    rects['semantic-table'] = domRect({ bottom: 760, top: 160 });
    rects['semantic-total'] = domRect({ bottom: 760, top: 712 });
    rects.shell = domRect({ bottom: 760, top: 160 });
    const view = render(<Fixture />);
    flushFrame();
    const masterToggle = screen.getByTestId('master-toggle');
    expect(screen.getByTestId('grand-total-dock')).toHaveAttribute('data-docked', 'false');
    expect(masterToggle).toHaveStyle({ left: '25px', position: 'fixed', top: '188px', visibility: 'visible' });

    view.rerender(<Fixture bottomInset={120} />);
    flushFrame();
    expect(screen.getByTestId('master-toggle')).toBe(masterToggle);
    expect(screen.getByTestId('grand-total-dock')).toHaveAttribute('data-docked', 'true');
    expect(screen.getByTestId('grand-total-dock')).toHaveStyle({ top: '532px' });
  });

  it('keeps a masked clearance below the docked grand total and includes it in the handoff', () => {
    render(<Fixture bottomInset={120} grandTotalClearance={24} />);
    flushFrame();

    const grandTotalDock = screen.getByTestId('grand-total-dock');
    expect(grandTotalDock).toHaveAttribute('data-docked', 'true');
    expect(grandTotalDock).toHaveStyle({ height: '72px', top: '508px' });

    rects['semantic-total'] = domRect({ bottom: 557, top: 509 });
    rects['semantic-table'] = domRect({ bottom: 557, top: -243 });
    fireEvent.scroll(screen.getByTestId('scroller'));
    flushFrame();
    expect(grandTotalDock).toHaveAttribute('data-docked', 'true');

    rects['semantic-total'] = domRect({ bottom: 556, top: 508 });
    rects['semantic-table'] = domRect({ bottom: 556, top: -244 });
    fireEvent.scroll(screen.getByTestId('scroller'));
    flushFrame();
    expect(grandTotalDock).toHaveAttribute('data-docked', 'false');
  });

  it('cancels pending work, disconnects observers, and removes scroll listeners on unmount', () => {
    const view = render(<Fixture />);
    flushFrame();
    const scroller = screen.getByTestId('scroller');

    fireEvent.scroll(scroller);
    expect(frameCallbacks.size).toBe(1);
    view.unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalled();
    expect(disconnectResizeObserver).toHaveBeenCalledTimes(1);
    requestAnimationFrameMock.mockClear();
    fireEvent.scroll(scroller);
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });
});

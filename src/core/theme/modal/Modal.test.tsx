import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/core/utils/hooks', () => ({
  KeyBoardEventType: { ESC: 'Escape' },
  useKeyDown: vi.fn(),
  useOnClickOutside: vi.fn(),
}));

function ModalHarness(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open modal</button>
      <Modal ariaLabelledBy="test-modal-title" close={() => setOpen(false)} isOpen={open}>
        <h2 id="test-modal-title">Test modal</h2>
        <input aria-label="First field" />
        <button>Last action</button>
      </Modal>
    </>
  );
}

describe('Modal accessibility', () => {
  it('skips controls in hidden tabs when wrapping focus', async () => {
    const user = userEvent.setup();
    render(
      <Modal isOpen close={() => undefined}>
        <button>First visible</button>
        <fieldset hidden disabled>
          <input aria-label="Hidden input" />
          <button>Hidden action</button>
        </fieldset>
        <button>Last visible</button>
      </Modal>,
    );
    const close = screen.getByRole('button', { name: 'common.close' });
    close.focus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last visible' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });
  it('can suspend its focus trap while a nested confirmation owns the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Modal isOpen>
          <button>Confirm first</button>
          <button>Confirm last</button>
        </Modal>
        <Modal isOpen suspendFocusTrap>
          <button>Underlying action</button>
        </Modal>
      </>,
    );
    screen.getByRole('button', { name: 'Confirm last' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Confirm first' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Confirm last' })).toHaveFocus();
  });
  it('applies an optional class only to the overlay', () => {
    const view = render(
      <Modal isOpen overlayClassName="pm-overlay">
        <span>Modal content</span>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    // eslint-disable-next-line testing-library/no-node-access
    const overlay = dialog.parentElement;
    expect(overlay).toHaveClass('pm-overlay');
    expect(dialog).not.toHaveClass('pm-overlay');

    view.rerender(
      <Modal isOpen>
        <span>Modal content</span>
      </Modal>,
    );
    expect(overlay).not.toHaveClass('pm-overlay');
  });

  it('renders an aria-modal dialog with a semantic close button and focuses inside on open', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole('button', { name: 'Open modal' }));

    const dialog = screen.getByRole('dialog', { name: 'Test modal' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = screen.getByRole('button', { name: 'common.close' });
    expect(close).toHaveFocus();
    expect(close).toBeVisible();
  });

  it('traps forward and backward Tab and returns focus to the trigger after close', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Open modal' });

    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'common.close' });
    const last = screen.getByRole('button', { name: 'Last action' });
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.click(close);
    expect(trigger).toHaveFocus();
  });
});

import type { ButtonProps } from '@/core/theme/button';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Confirmation, { ConfirmationAction } from './Confirmation';

const mockButtonOnClicks = new Map<string, () => unknown>();

vi.mock('@/core/theme/button', async () => {
  const actualButton = await vi.importActual<typeof import('@/core/theme/button')>('@/core/theme/button');

  return {
    ...actualButton,
    __esModule: true,
    default: (props: ButtonProps): JSX.Element => {
      if (props.label && props.onClick) mockButtonOnClicks.set(props.label, props.onClick as () => unknown);

      return actualButton.default(props);
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const syncValueAction: ConfirmationAction = {
  action: () => 42,
  text: 'Return sync value',
};

const getButtonOnClick = (label: string): (() => unknown) => {
  const onClick = mockButtonOnClicks.get(label);
  if (!onClick) throw new Error(`No Button onClick captured for ${label}`);

  return onClick;
};

const createDeferred = <T,>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
} => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

beforeEach(() => {
  mockButtonOnClicks.clear();
});

describe('Confirmation keyboard behavior', () => {
  it('uses its visible title as the dialog accessible name', () => {
    render(
      <Confirmation
        actionType="delete"
        confirmActions={[{ action: vi.fn(), text: 'Delete permanently' }]}
        isOpen
        onCancel={vi.fn()}
        text="This cannot be undone."
        title="Delete this item?"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Delete this item?' })).toBeVisible();
  });

  it('runs actions only for the natively focused button', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const confirm = vi.fn();

    render(
      <Confirmation
        actionType="delete"
        confirmActions={[{ action: confirm, text: 'Delete permanently' }]}
        isOpen
        onCancel={cancel}
        text="Delete this item?"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'common.modal' })).toBeVisible();
    const closeButton = screen.getByRole('button', { name: 'common.close' });
    const cancelButton = screen.getByRole('button', { name: 'common.cancel' });
    const confirmButton = screen.getByRole('button', { name: 'Delete permanently' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.keyboard('{Enter}');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();

    await user.tab();
    expect(cancelButton).toHaveFocus();
    cancel.mockClear();
    await user.keyboard('{Enter}');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();

    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(confirm).toHaveBeenCalledTimes(1);

    await user.tab({ shift: true });
    expect(cancelButton).toHaveFocus();
  });

  it('focuses the exact initial confirm action before an action marked as focused', async () => {
    render(
      <Confirmation
        actionType="success_add"
        confirmActions={[
          { action: vi.fn(), isFocused: true, text: 'Add another' },
          { action: vi.fn(), text: 'View details' },
        ]}
        initialFocusButtonText="View details"
        isOpen
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'View details' })).toHaveFocus());
  });

  it('focuses the first marked confirm action when the requested initial action is missing', async () => {
    render(
      <Confirmation
        actionType="success_add"
        confirmActions={[
          { action: vi.fn(), text: 'View details' },
          { action: vi.fn(), isFocused: true, text: 'Add another' },
          { action: vi.fn(), isFocused: true, text: 'Open client' },
        ]}
        initialFocusButtonText="Unavailable action"
        isOpen
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add another' })).toHaveFocus());
  });

  it('keeps the Modal default focus when initial text only matches the cancel button', async () => {
    render(
      <Confirmation
        actionType="delete"
        cancelBtnText="Keep item"
        confirmActions={[{ action: vi.fn(), text: 'Delete item' }]}
        initialFocusButtonText="Keep item"
        isOpen
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus());
  });
});

describe('Confirmation pending behavior', () => {
  it('preserves sync value action source compatibility and return semantics', () => {
    render(<Confirmation actionType="attention" confirmActions={[syncValueAction]} isOpen onCancel={vi.fn()} />);

    expect(getButtonOnClick('Return sync value')()).toBe(42);
  });

  it('forwards per-action disabled and loading states to Button', () => {
    render(
      <Confirmation
        actionType="attention"
        confirmActions={[
          { action: vi.fn(), disabled: true, text: 'Disabled action' },
          { action: vi.fn(), loading: true, text: 'Loading action' },
        ]}
        isOpen
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Disabled action' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Loading action' })).not.toHaveTextContent('Loading action');
  });

  it('disables every footer action and makes Modal dismissal unavailable while submitting', () => {
    const cancel = vi.fn();

    render(
      <Confirmation
        actionType="delete"
        confirmActions={[
          { action: vi.fn(), text: 'Delete' },
          { action: vi.fn(), loading: true, text: 'Archive instead' },
        ]}
        isOpen
        isSubmitting
        onCancel={cancel}
      />,
    );

    expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveTextContent('Delete');
    expect(screen.getByRole('button', { name: 'Archive instead' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive instead' })).not.toHaveTextContent('Archive instead');

    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('returns the original promise and synchronously suppresses action and cancel races until resolution', async () => {
    const deferred = createDeferred<{ id: string }>();
    const resolvedValue = { id: 'resolved-value' };
    const action = vi.fn<() => unknown>().mockReturnValueOnce(deferred.promise).mockReturnValue(42);
    const cancel = vi.fn();

    render(
      <Confirmation
        actionType="delete"
        confirmActions={[
          { action, text: 'Delete' },
          { action: vi.fn(), text: 'Archive instead' },
        ]}
        isOpen
        onCancel={cancel}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    const actionOnClick = getButtonOnClick('Delete');
    const cancelOnClick = getButtonOnClick('common.cancel');
    let returnedResult: unknown;
    let duplicateResult: unknown;
    let cancelResult: unknown;
    act(() => {
      returnedResult = actionOnClick();
      duplicateResult = actionOnClick();
      cancelResult = cancelOnClick();
    });

    expect(returnedResult).toBe(deferred.promise);
    expect(duplicateResult).toBeUndefined();
    expect(cancelResult).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(cancel).not.toHaveBeenCalled();
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).not.toHaveTextContent('Delete');
    expect(screen.getByRole('button', { name: 'Archive instead' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive instead' })).toHaveTextContent('Archive instead');
    expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();

    await act(async () => {
      deferred.resolve(resolvedValue);
      await expect(returnedResult as Promise<unknown>).resolves.toBe(resolvedValue);
    });

    await waitFor(() => expect(deleteButton).toBeEnabled());
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument();
    expect(getButtonOnClick('Delete')()).toBe(42);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('returns the original rejected promise and preserves its exact rejection while releasing the guard', async () => {
    const deferred = createDeferred<void>();
    const rejectionReason = { code: 'request_failed' };
    const action = vi.fn<() => unknown>().mockReturnValueOnce(deferred.promise).mockReturnValue(undefined);

    render(
      <Confirmation actionType="warning" confirmActions={[{ action, text: 'Retry' }]} isOpen onCancel={vi.fn()} />,
    );

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    let returnedResult: unknown;
    act(() => {
      returnedResult = getButtonOnClick('Retry')();
    });
    expect(returnedResult).toBe(deferred.promise);

    await act(async () => {
      deferred.reject(rejectionReason);
      await expect(returnedResult as Promise<unknown>).rejects.toBe(rejectionReason);
    });

    await waitFor(() => expect(retryButton).toBeEnabled());
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument();
    expect(getButtonOnClick('Retry')()).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('protects a deterministic non-native thenable until it settles and returns it unchanged', async () => {
    const deferred = createDeferred<{ status: string }>();
    const settledValue = { status: 'settled' };
    const thenable = { then: deferred.promise.then.bind(deferred.promise) };
    const action = vi.fn<() => unknown>().mockReturnValueOnce(thenable).mockReturnValue(7);
    const cancel = vi.fn();

    render(
      <Confirmation
        actionType="warning"
        confirmActions={[
          { action, text: 'Run thenable' },
          { action: vi.fn(), text: 'Other action' },
        ]}
        isOpen
        onCancel={cancel}
      />,
    );

    const actionOnClick = getButtonOnClick('Run thenable');
    const cancelOnClick = getButtonOnClick('common.cancel');
    let returnedResult: unknown;
    act(() => {
      returnedResult = actionOnClick();
      expect(actionOnClick()).toBeUndefined();
      expect(cancelOnClick()).toBeUndefined();
    });

    expect(returnedResult).toBe(thenable);
    expect(action).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Run thenable' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run thenable' })).not.toHaveTextContent('Run thenable');
    expect(screen.getByRole('button', { name: 'Other action' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Other action' })).toHaveTextContent('Other action');
    expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cancel).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve(settledValue);
      await expect(Promise.resolve(returnedResult)).resolves.toBe(settledValue);
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Run thenable' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument();
    expect(getButtonOnClick('Run thenable')()).toBe(7);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('handles a throwing then getter without throwing or leaking a pending guard', async () => {
    const getterError = new Error('then getter failed');
    const valueWithThrowingThen = Object.defineProperty({}, 'then', {
      get: () => {
        throw getterError;
      },
    });
    const action = vi.fn<() => unknown>().mockReturnValueOnce(valueWithThrowingThen).mockReturnValue('retry');
    const cancel = vi.fn();

    render(
      <Confirmation
        actionType="warning"
        confirmActions={[{ action, text: 'Inspect then' }]}
        isOpen
        onCancel={cancel}
      />,
    );

    const actionOnClick = getButtonOnClick('Inspect then');
    const cancelOnClick = getButtonOnClick('common.cancel');
    let returnedResult: unknown;
    act(() => {
      expect(() => {
        returnedResult = actionOnClick();
      }).not.toThrow();
      expect(actionOnClick()).toBeUndefined();
      expect(cancelOnClick()).toBeUndefined();
    });

    expect(returnedResult).toBe(valueWithThrowingThen);
    expect(action).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    await act(async () => Promise.resolve());

    expect(getButtonOnClick('Inspect then')()).toBe('retry');
    expect(action).toHaveBeenCalledTimes(2);
  });
});

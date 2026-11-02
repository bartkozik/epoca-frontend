import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextArea from './TextArea';
import styles from './TextArea.module.scss';

describe('TextArea accessibility', () => {
  it('associates its visible label with the textarea through the supplied name', () => {
    render(<TextArea label="Description of activities" name="taskDescription" onChange={vi.fn()} />);

    const textarea = screen.getByLabelText('Description of activities');
    expect(textarea).toHaveAttribute('id', 'taskDescription');
    expect(textarea).toHaveAttribute('name', 'taskDescription');
  });
});

it('keeps readonly text selectable while using the shared readonly appearance', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TextArea label="Saved details" name="saved" value="Original text" readOnly onChange={onChange} />);
  const field = screen.getByRole('textbox', { name: 'Saved details' });
  await user.tab();
  expect(field).toHaveFocus();
  expect(field).not.toBeDisabled();
  await user.keyboard('changed');
  expect(field).toHaveValue('Original text');
  expect(onChange).not.toHaveBeenCalled();
  expect(field).toHaveClass(styles.inputReadOnly);
});

it('preserves ordinary editable textarea behavior and appearance', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TextArea label="Draft details" name="draft" onChange={onChange} />);
  const field = screen.getByRole('textbox', { name: 'Draft details' });
  await user.type(field, 'Draft');
  expect(field).toHaveValue('Draft');
  expect(onChange).toHaveBeenCalled();
  expect(field).not.toHaveClass(styles.inputReadOnly);
});

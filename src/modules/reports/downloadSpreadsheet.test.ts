import { downloadSpreadsheet } from './downloadSpreadsheet';
import { SpreadsheetFormat } from './types';

describe('downloadSpreadsheet', () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();
  let anchor: HTMLAnchorElement;

  beforeEach(() => {
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    anchor = document.createElement('a');
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    vi.spyOn(anchor, 'remove').mockImplementation(() => undefined);
    vi.spyOn(anchor, 'setAttribute');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads CSV with the exact filename and cleans up the temporary link', () => {
    createObjectURL.mockReturnValueOnce('blob:test');

    expect(() => downloadSpreadsheet(new Blob(['x']), 'pivot.csv', SpreadsheetFormat.CSV)).not.toThrow();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toEqual(expect.objectContaining({ type: 'text/csv;charset=utf-8' }));
    expect(anchor.setAttribute).toHaveBeenCalledWith('download', 'pivot.csv');
    expect(document.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('preserves a click error while cleaning up an XLSX download', () => {
    createObjectURL.mockReturnValueOnce('blob:test-2');
    vi.spyOn(anchor, 'click').mockImplementationOnce(() => {
      throw new Error('click failed');
    });

    expect(() => downloadSpreadsheet(new Blob(['x']), 'pivot.xlsx', SpreadsheetFormat.XLS)).toThrow('click failed');

    expect(createObjectURL.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    expect(anchor.setAttribute).toHaveBeenCalledWith('download', 'pivot.xlsx');
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-2');
  });
});

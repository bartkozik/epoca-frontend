export const parseTaskIds = (taskId?: string | null): string[] =>
  (taskId ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

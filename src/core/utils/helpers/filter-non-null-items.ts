export const filterNonNullItems = <T>(data: T[], field: keyof T): T[] => {
  return data.filter((item) => Boolean(item[field]));
};

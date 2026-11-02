export const convertCamelOrKebabCaseToSnakeCase = (str: string): string => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/ /g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase();
};

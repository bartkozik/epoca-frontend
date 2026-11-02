import qs from 'qs';

export const serializeParams = (params: unknown): string =>
  qs.stringify(params, {
    arrayFormat: 'repeat',
  });

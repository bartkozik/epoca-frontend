type RefreshAccessToken = (refreshToken: string) => Promise<string>;

let refreshAccessToken: RefreshAccessToken | undefined;
let inFlightRefresh: { token: string; handler: RefreshAccessToken; promise: Promise<string> } | undefined;

export function setRefreshAccessTokenHandler(handler: RefreshAccessToken): () => void {
  refreshAccessToken = handler;
  return () => {
    if (refreshAccessToken === handler) refreshAccessToken = undefined;
  };
}

export function getRefreshedAccessToken(refreshToken: string): Promise<string> {
  if (!refreshAccessToken) return Promise.reject(new Error('Authentication is not initialized'));
  if (inFlightRefresh?.token === refreshToken && inFlightRefresh.handler === refreshAccessToken)
    return inFlightRefresh.promise;

  const handler = refreshAccessToken;
  const refresh = handler(refreshToken).finally(() => {
    if (inFlightRefresh?.promise === refresh) inFlightRefresh = undefined;
  });
  inFlightRefresh = { token: refreshToken, handler, promise: refresh };
  return refresh;
}

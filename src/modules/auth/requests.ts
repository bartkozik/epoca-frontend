import api from '@/core/api';
import env from '@/core/config/env';
import axios, { AxiosResponse } from 'axios';
import { AuthTokens, AuthTokensSchema } from './models/authTokensDto.model';

export async function login(email: string, password: string): Promise<AuthTokens> {
  const response = await api.post<unknown>('/auth/login', { email, password });
  return AuthTokensSchema.parse(response.data);
}

export async function loginWithRefreshToken(token: string): Promise<AuthTokens> {
  const response = await api.post<unknown>(
    '/auth/refresh-token',
    { refreshTokenJwt: token },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      skipConnectionErrorToast: true,
    },
  );
  return AuthTokensSchema.parse(response.data);
}

export function invalidateRefreshToken(accessToken: string, deviceId: string): Promise<AxiosResponse> {
  return axios.delete(`${env.backendUrl}/auth/refresh-tokens/${deviceId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'device-id': deviceId,
    },
  });
}

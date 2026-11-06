import api from '@/core/api';
import { RawUserSchema, RawUsersSchema, UserCreateResultSchema } from './models/userDto.model';
import { UserDeleteReturn, UserReturn, UsersReturn } from './types';

export async function getUsers(): UsersReturn {
  const response = await api.get<unknown>('/users');
  return { ...response, data: RawUsersSchema.parse(response.data) };
}

export async function getUser(userId: string): UserReturn {
  const response = await api.get<unknown>(`/users/${userId}`);
  return { ...response, data: RawUserSchema.parse(response.data) };
}

export async function createUser(firstName: string, lastName: string, email: string): UserReturn {
  const response = await api.post<unknown>('/users', {
    firstName,
    lastName,
    email,
    password: null,
    superAdminKey: null,
  });
  return { ...response, data: UserCreateResultSchema.parse(response.data).user };
}

export async function updateUser(userId: string, name: string): Promise<void> {
  const response = await api.patch<unknown>(`/users/${userId}`, { name });
  const parsed = RawUserSchema.safeParse(response.data);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error);
  }
}

export const deleteUser = (userId: string): UserDeleteReturn => {
  return api.delete(`/users/${userId}`);
};

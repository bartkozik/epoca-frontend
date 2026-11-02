import { z } from 'zod';

const EmailSchema = z.string().email();

export function normalizeGravatarEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return EmailSchema.safeParse(normalized).success ? normalized : undefined;
}

export async function createGravatarUrl(email: string | undefined): Promise<string | undefined> {
  const normalized = normalizeGravatarEmail(email);
  if (!normalized || !globalThis.crypto?.subtle) return undefined;

  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `https://gravatar.com/avatar/${hash}?s=96&r=g&d=404`;
  } catch {
    // Browsers without usable Web Crypto still render the local initials fallback.
    return undefined;
  }
}

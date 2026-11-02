import { createGravatarUrl, normalizeGravatarEmail } from '@/core/utils/helpers/gravatar';
import { useEffect, useState } from 'react';

export function useGravatarUrl(email: string | undefined): { url: string | undefined; isLoading: boolean } {
  const normalizedEmail = normalizeGravatarEmail(email);
  const [result, setResult] = useState<{ email: string; url: string | undefined }>();

  useEffect(() => {
    if (!normalizedEmail) return;
    let active = true;
    void createGravatarUrl(normalizedEmail).then((url) => {
      if (active) setResult({ email: normalizedEmail, url });
    });
    return () => {
      active = false;
    };
  }, [normalizedEmail]);

  const currentResult = result?.email === normalizedEmail ? result : undefined;
  return { url: currentResult?.url, isLoading: Boolean(normalizedEmail && !currentResult) };
}

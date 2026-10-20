import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { redirect } from 'next/navigation';
import { isAppError } from '@web12/core';

export function fail(path: string, err: unknown): never {
  if (isRedirectError(err)) throw err;
  if (!isAppError(err)) console.error(err);
  const message = isAppError(err) ? err.message : 'Có lỗi xảy ra, vui lòng thử lại';
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}

export function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;
  const ok = typeof searchParams.ok === 'string' ? searchParams.ok : null;
  if (!error && !ok) return null;
  return (
    <div className={`mb-4 rounded px-3 py-2 text-sm ${error ? 'bg-accent/10 text-accent' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
      {error ?? ok}
    </div>
  );
}

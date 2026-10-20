export function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;
  const ok = typeof searchParams.ok === 'string' ? searchParams.ok : null;
  if (!error && !ok) return null;
  return (
    <div className={`mb-4 rounded px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
      {error ?? ok}
    </div>
  );
}

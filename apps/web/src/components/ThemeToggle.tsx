'use client';

// Runs before paint (inlined in <head>) so the page never flashes the wrong theme.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`;

export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }
  return (
    <button type="button" onClick={toggle} aria-label="Chuyển sáng/tối"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-sm transition-colors hover:border-fg">
      <span className="dark:hidden">☾</span>
      <span className="hidden dark:inline">☀</span>
    </button>
  );
}

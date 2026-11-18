import type { ReactNode } from 'react';
import BrandMark from './BrandMark';

type IconKey = 'app' | 'about' | 'stats';

// Nav icons rendered inline so the header has no external icon-set dep.
// Match the paths from views/*.html so the visual is identical.
const ICONS: Record<IconKey, ReactNode> = {
  app: (
    <>
      <path d="M3 12l9-9 9 9" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  ),
  stats: (
    <>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </>
  ),
};

type NavLink = { href: string; label: string; icon: IconKey };

type Props = { hide?: IconKey };

// `hide` lets a page drop its own icon from the header (e.g. the About page
// doesn't need to link to itself).
export default function Header({ hide }: Props) {
  const links: NavLink[] = (
    [
      { href: '/', label: 'App', icon: 'app' },
      { href: '/about', label: 'Info', icon: 'about' },
      { href: '/stats', label: 'Stats', icon: 'stats' },
    ] as const
  ).filter((l) => l.icon !== hide);

  return (
    <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-bg">
      <a href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-text no-underline">
        <BrandMark />
        <span>WOTS++</span>
      </a>
      <nav className="flex items-center gap-2.5">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            title={l.label}
            aria-label={l.label}
            className={`h-10 inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-border-strong bg-surface text-text no-underline transition-colors hover:bg-surface-2 ${l.icon === 'about' ? 'px-2.5' : 'w-10'}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[l.icon]}
            </svg>
            {l.icon === 'about' && <span className="text-sm">{l.label}</span>}
          </a>
        ))}
      </nav>
    </header>
  );
}

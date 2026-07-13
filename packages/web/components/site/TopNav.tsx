import Link from 'next/link';
import { gridBasePath, navItems, siteName } from '@/lib/site-config';

export function TopNav() {
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <Link href={gridBasePath} className="top-nav-brand" aria-label={siteName}>
          <img
            src="/icons/superplot_full_white_bg.svg"
            alt={siteName}
            className="brand-logo brand-logo-light"
          />
          <img
            src="/icons/superplot_full_dark_bg.svg"
            alt=""
            aria-hidden="true"
            className="brand-logo brand-logo-dark"
          />
        </Link>
        <nav aria-label="Primary">
          <ul className="top-nav-links">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="theme-toggle"
          data-theme-toggle
          aria-label="Cycle color theme between light, dark, and system"
          suppressHydrationWarning
        >
          theme:system
        </button>
      </div>
    </header>
  );
}

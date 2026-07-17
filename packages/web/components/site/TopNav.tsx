import Link from 'next/link';
import { DiscordIcon, GithubIcon } from '@/components/icons/BrandIcons';
import { discordUrl, githubUrl, gridBasePath, navItems, siteName } from '@/lib/site-config';

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
        <input
          type="checkbox"
          id="nav-menu-toggle"
          className="nav-menu-checkbox"
          aria-label="Toggle navigation menu"
        />
        <nav className="top-nav-nav" aria-label="Primary">
          <ul className="top-nav-links">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="top-nav-actions">
          <a
            className="top-nav-icon-link"
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <GithubIcon className="top-nav-icon" />
          </a>
          <a
            className="top-nav-icon-link"
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
          >
            <DiscordIcon className="top-nav-icon" />
          </a>
          <button
            type="button"
            className="theme-toggle"
            data-theme-toggle
            aria-label="Cycle color theme between light, dark, and system"
            suppressHydrationWarning
          >
            theme:system
          </button>
          <label htmlFor="nav-menu-toggle" className="nav-menu-button" aria-hidden="true">
            <span className="nav-menu-bars" />
          </label>
        </div>
      </div>
    </header>
  );
}

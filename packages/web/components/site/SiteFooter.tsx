import Link from 'next/link';
import {
  contactEmail,
  discordUrl,
  footerLinkGroups,
  githubUrl,
  siteName,
  twitterUrl,
} from '@/lib/site-config';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <p className="site-footer-name">
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
            </p>
            <p>The JavaScript grid built for agents.</p>
            <p>
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          </div>
          {footerLinkGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="site-footer-heading">{group.title}</p>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <nav aria-label="Community">
            <p className="site-footer-heading">Community</p>
            <ul>
              <li>
                <a href={githubUrl}>GitHub</a>
              </li>
              <li>
                <a href={discordUrl}>Discord</a>
              </li>
              <li>
                <a href={twitterUrl}>Twitter / X</a>
              </li>
            </ul>
          </nav>
        </div>
        <p className="site-footer-legal">© 2026 {siteName}. All rights reserved.</p>
      </div>
    </footer>
  );
}

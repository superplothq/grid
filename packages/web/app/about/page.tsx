import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { RouteHero } from '@/components/site/RouteHero';
import { aboutPath, contactPath, siteName, siteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'About',
  description: 'About SuperPlot: the team building the agent-first JavaScript grid.',
  alternates: { canonical: `${siteUrl}${aboutPath}` },
};

interface TeamLink {
  label: string;
  href: string;
}

interface TeamMember {
  name: string;
  initials: string;
  links: TeamLink[];
}

const foundingTeam: TeamMember[] = [
  {
    name: 'Akash Goswami',
    initials: 'AG',
    links: [
      { label: 'GitHub', href: 'https://github.com/adotg' },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/akash-goswami/' },
      { label: 'X', href: 'https://x.com/akashdotg' },
    ],
  },
  {
    name: 'Pallav Nadhani',
    initials: 'PN',
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/pallavn/' },
      { label: 'X', href: 'https://x.com/pallavn' },
    ],
  },
  {
    name: 'Siddeshwar Patri',
    initials: 'SP',
    links: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/siddeshwar-patri/' }],
  },
  {
    name: 'Vikas Potta',
    initials: 'VP',
    links: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/vikaspotta/' }],
  },
];

export default function AboutPage() {
  return (
    <main className="approach-main">
      <JsonLd breadcrumbs={[{ name: 'About', path: aboutPath }]} />
      <RouteHero
        title={`About ${siteName}`}
        lead="We build data-grid infrastructure for the agent era: composable primitives that let humans and coding agents create advanced grids, pivots, and data views together."
      />

      <section className="section approach-section">
        <div className="approach-body">
          <p>
            At {siteName}, we are building new age tools at the intersection of agentic development
            and business intelligence. We are a part of DataFlow Solutions Pte Ltd (Singapore), with
            offices in Bangalore.
          </p>
          <p>
            We are a small team of ex-founders, engineers, PMs and enterprise experts who share deep
            passion for information visualization, BI, developer tools and more.
          </p>
          <p>
            Previously, we&rsquo;ve built and scaled multiple products like{' '}
            <a href="https://www.fusioncharts.com/" target="_blank" rel="noopener noreferrer">
              FusionCharts
            </a>
            ,{' '}
            <a
              href="https://mode.com/press/mode-acquires-muze"
              target="_blank"
              rel="noopener noreferrer"
            >
              Muze
            </a>
            ,{' '}
            <a href="https://www.collabion.com/" target="_blank" rel="noopener noreferrer">
              Collabion
            </a>
            , Fable, and many more. Between the founding team, we&rsquo;ve over 70 years of combined
            experience in the field of information visualization and developer tools.
          </p>
        </div>
      </section>

      <section className="section approach-section">
        <h2 className="approach-heading">Founding team</h2>
        <ul className="team-grid">
          {foundingTeam.map((member) => (
            <li key={member.name} className="team-member">
              <span className="team-avatar" aria-hidden="true">
                {member.initials}
              </span>
              <p className="team-name">{member.name}</p>
              <p className="team-links">
                {member.links.map((link) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section approach-section">
        <p>
          <Link className="button button-primary" href={contactPath}>
            Get in touch
          </Link>
        </p>
      </section>
    </main>
  );
}

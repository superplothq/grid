export const siteName = 'SuperPlot';
export const siteUrl = 'https://superplot.dev';
export const gridBasePath = '/grid';
export const gridDocsPath = '/grid/docs';
export const gridSamplesPath = '/grid/samples';
export const docsPath = '/grid/docs';
export const gridDemosPath = '/grid/#demos';
export const ourApproachPath = '/grid/our-approach';
export const aboutPath = '/about';
export const contactPath = '/contact';
export const contactEmail = 'hello@superplot.dev';
export const githubUrl = 'https://github.com/superplothq/grid';
export const discordUrl = 'https://discord.gg/SK5mxxt8f';
export const twitterUrl = 'https://x.com/superplothq';

export interface NavItem {
  label: string;
  href: string;
}

export const navItems: NavItem[] = [
  { label: 'Docs', href: docsPath },
  { label: 'Our approach', href: ourApproachPath },
  { label: 'About', href: aboutPath },
  { label: 'Contact', href: contactPath },
];

export interface FooterLinkGroup {
  title: string;
  links: NavItem[];
}

export const footerLinkGroups: FooterLinkGroup[] = [
  {
    title: 'Product',
    links: [
      { label: 'Grid', href: gridBasePath },
      { label: 'Demos', href: gridDemosPath },
      { label: 'Docs', href: docsPath },
    ],
  },
  {
    title: 'Our approach',
    links: [
      { label: 'Headless architecture', href: `${ourApproachPath}#principles/headless-architecture` },
      { label: 'Fullstack grid', href: `${ourApproachPath}#principles/fullstack-grid` },
      { label: 'Table algebra', href: `${ourApproachPath}#principles/table-algebra` },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: aboutPath },
      { label: 'Contact', href: contactPath },
    ],
  },
];

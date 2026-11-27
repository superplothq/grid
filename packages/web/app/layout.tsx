import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { SiteFooter } from '@/components/site/SiteFooter';
import { TopNav } from '@/components/site/TopNav';
import { analyticsHost, gtmId, siteName, siteUrl } from '@/lib/site-config';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body-next',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-next',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} - JavaScript grid built for agents`,
    template: `%s | ${siteName}`,
  },
  description:
    'Create advanced grids, pivots, and data views using prompts, typed APIs, and composable primitives.',
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    siteName,
    type: 'website',
  },
  twitter: {
    card: 'summary',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>
        <Script id="google-tag-manager">
          {`
            var analyticsHost = ${JSON.stringify(analyticsHost)};
            if ('*' in analyticsHost || location.hostname.toLowerCase() in analyticsHost) {
              window.dataLayer = window.dataLayer || [];
              window.gtag = function(){dataLayer.push(arguments);};
              gtag('js', new Date());
              var gtm = document.createElement('script');
              gtm.async = true;
              gtm.src = 'https://www.googletagmanager.com/gtm.js?id=${gtmId}';
              document.head.appendChild(gtm);
            }
          `}
        </Script>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('sp-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
        <TopNav />
        {children}
        <SiteFooter />
        <script src="/enhance.js" defer />
      </body>
    </html>
  );
}

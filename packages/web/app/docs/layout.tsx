import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/docs-source';
import { DocsProvider } from '@/components/docs/provider';
import { MobileSidebarFab } from '@/components/docs/mobile-sidebar-fab';
import './docs.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsProvider>
      <DocsLayout
        tree={source.getPageTree()}
        nav={{ enabled: false }}
        themeSwitch={{ enabled: false }}
        sidebar={{ collapsible: true }}
      >
        {children}
        <MobileSidebarFab />
      </DocsLayout>
    </DocsProvider>
  );
}

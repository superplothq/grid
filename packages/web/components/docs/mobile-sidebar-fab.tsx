'use client';

import { SidebarTrigger } from 'fumadocs-ui/components/sidebar/base';

// Web uses its own TopNav and disables the fumadocs nav, which is what normally
// carries the mobile sidebar trigger. Fumadocs still renders the sidebar as an
// off-canvas drawer under 768px (it just has no opener), so this floating button
// toggles that drawer. The drawer already closes on navigation and via its own
// overlay/close button. Hidden on desktop, where the sidebar is a normal column.
export function MobileSidebarFab() {
  return (
    <SidebarTrigger className="docs-sidebar-fab" aria-label="Open documentation menu">
      <span className="docs-sidebar-fab-bars" aria-hidden="true" />
      <span>Menu</span>
    </SidebarTrigger>
  );
}

import type { StackBarItem } from '@/lib/home-content';

function MarqueeTrack({
  items,
  hidden,
  logoZoom,
}: {
  items: StackBarItem[];
  hidden?: boolean;
  logoZoom?: boolean;
}) {
  return (
    <ul className="marquee-track" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item.name}>
          {item.icon ? (
            <span
              className={[
                'stack-logo',
                logoZoom ? 'stack-logo-zoom' : '',
                item.darkInvert ? 'stack-logo-dark-invert' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <img src={item.icon} alt="" width={20} height={20} />
            </span>
          ) : null}
          {item.name}
        </li>
      ))}
    </ul>
  );
}

export function AgentStackBar({
  agents,
  stacks,
}: {
  agents: StackBarItem[];
  stacks: StackBarItem[];
}) {
  return (
    <section className="agent-stack-bar" aria-label="Built for any agent and stack">
      <div className="agent-stack-row" data-marquee="always">
        <p className="agent-stack-title">Built for any agent</p>
        <div className="marquee">
          <MarqueeTrack items={agents} logoZoom />
          <MarqueeTrack items={agents} logoZoom hidden />
        </div>
      </div>
      <div className="agent-stack-row" data-marquee="mobile">
        <p className="agent-stack-title">Built for any stack</p>
        <div className="marquee">
          <MarqueeTrack items={stacks} />
          <MarqueeTrack items={stacks} hidden />
        </div>
      </div>
    </section>
  );
}

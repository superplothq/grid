export function RouteHero({ title, lead }: { title: string; lead: string }) {
  return (
    <section className="route-hero">
      <h1>{title}</h1>
      <p className="route-hero-lead">{lead}</p>
    </section>
  );
}

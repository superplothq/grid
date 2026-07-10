export function PlaceholderContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="placeholder-content" role="note">
      <p className="placeholder-badge">Placeholder</p>
      <div>{children}</div>
    </div>
  );
}

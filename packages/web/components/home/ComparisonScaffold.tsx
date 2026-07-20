import { comparisonCloser, comparisonNote, comparisonRows } from '@/lib/home-content';

export function ComparisonScaffold() {
  return (
    <section id="comparison" aria-labelledby="comparison-heading" className="section">
      <h2 id="comparison-heading">What does it mean to be built for agents?</h2>
      <p className="section-lead">{comparisonNote}</p>
      <div className="table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col">Built for agents</th>
              <th scope="col">Built for humans</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.dimension}>
                <th scope="row">{row.dimension}</th>
                <td>{row.agent}</td>
                <td>{row.human}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="comparison-closer">{comparisonCloser}</p>
    </section>
  );
}

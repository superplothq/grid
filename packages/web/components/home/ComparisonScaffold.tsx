import { comparisonNote, comparisonRows } from '@/lib/home-content';
import { siteName } from '@/lib/site-config';

export function ComparisonScaffold() {
  return (
    <section id="comparison" aria-labelledby="comparison-heading" className="section">
      <h2 id="comparison-heading">Why {siteName}?</h2>
      <p className="section-lead">{comparisonNote}</p>
      <div className="table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col">{siteName}</th>
              <th scope="col">Traditional grid libraries</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.dimension}>
                <th scope="row">{row.dimension}</th>
                <td>{row.superplot}</td>
                <td>{row.traditional}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

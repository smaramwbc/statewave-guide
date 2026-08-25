/**
 * The landing screen.
 *
 * Note the `data-guide` attributes: these are what the indexer reads out of this
 * file, and — because the runtime registers the same identifiers — what the guide
 * can point at while the app is running.
 */
export function Dashboard() {
  return (
    <main data-guide="dashboard" data-guide-type="section">
      <h2>Dashboard</h2>
      <p className="lede">
        A demo application for Statewave Guide. Everything the guide can point at is marked with a{' '}
        <code>data-guide</code> attribute in the source.
      </p>

      <section>
        <h3>Overview</h3>
        <table data-guide="dashboard.summary" data-guide-label="Workspace summary">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Active clients</td>
              <td>2</td>
            </tr>
            <tr>
              <td>Prospects</td>
              <td>1</td>
            </tr>
            <tr>
              <td>Archived</td>
              <td>1</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>How this demo works</h3>
        <p className="lede">
          Open the panel at the bottom right and use it to navigate, scroll and highlight. Each
          button sends a named action through the action runtime — nothing in this app is driven by
          a CSS selector.
        </p>
      </section>
    </main>
  );
}

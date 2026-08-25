export default function Dashboard({ dynamicId }: { dynamicId: string }) {
  return (
    <main data-guide="dashboard">
      <a data-ai-id="dashboard.docs" href="/docs">Documentation</a>
      <div data-guide="#app > div">Selectors are never valid guide ids.</div>
      <input data-guide="dashboard.search" aria-label="Search clients" />
      <button data-guide={'dashboard.refresh'}>Refresh</button>
      <button data-guide={`dashboard.${'computed'}`}>Not indexable</button>
      <button data-guide="dashboard.export" data-ai-id="dashboard.legacy">Export</button>
      <span data-guide={dynamicId} data-ai-id="dashboard.fallback">Fallback</span>
    </main>
  );
}

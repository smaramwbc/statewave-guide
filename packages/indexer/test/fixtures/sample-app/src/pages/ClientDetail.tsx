import type { Client } from '../types/client';

export function ClientDetail({ client }: { client: Client }) {
  return (
    <article data-guide="clients.detail">
      <h2>{client.name}</h2>
    </article>
  );
}

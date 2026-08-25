import type { Client } from '../types/client';

export async function fetchClients(): Promise<Client[]> {
  const response = await fetch('/api/clients');
  return (await response.json()) as Client[];
}

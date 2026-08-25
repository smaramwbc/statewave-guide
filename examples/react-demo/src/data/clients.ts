/** Static demo data. There is no backend in this example. */
export interface Client {
  id: string;
  name: string;
  industry: string;
  status: 'active' | 'prospect' | 'archived';
  owner: string;
}

export const clients: Client[] = [
  { id: '1', name: 'Northwind Trading', industry: 'Logistics', status: 'active', owner: 'Ada' },
  { id: '2', name: 'Contoso Health', industry: 'Healthcare', status: 'active', owner: 'Grace' },
  { id: '3', name: 'Fabrikam Labs', industry: 'Research', status: 'prospect', owner: 'Alan' },
  { id: '4', name: 'Tailwind Freight', industry: 'Logistics', status: 'archived', owner: 'Ada' },
];

export function findClient(id: string): Client | undefined {
  return clients.find((client) => client.id === id);
}

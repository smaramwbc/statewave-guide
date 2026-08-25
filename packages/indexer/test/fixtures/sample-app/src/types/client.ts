export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
}

export type ClientId = Client['id'];

export enum ClientStatus {
  Active = 'active',
  Archived = 'archived',
}

interface InternalOnly {
  secret: string;
}

export type WithSecret = InternalOnly;

/** Zod schemas for the client endpoints. */
import { z } from 'zod';

/** Billing tiers a client may be on. */
export const planTierSchema = z.enum(['free', 'team', 'enterprise']);

/** Body of `POST /clients`. */
export const createClientSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  plan: planTierSchema.default('team'),
});

/** Body of `PUT /clients/:clientId`. Every field optional. */
export const updateClientSchema = createClientSchema.partial();

/** Query string of `GET /clients`. */
export const clientListQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['active', 'trial', 'churned']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Path parameters shared by the item endpoints. */
export const clientIdParamSchema = z.object({ clientId: z.string().min(1) });

/** Validated body of `POST /clients`. */
export type CreateClientInput = z.infer<typeof createClientSchema>;

/** Validated body of `PUT /clients/:clientId`. */
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

/** Validated query of `GET /clients`. */
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

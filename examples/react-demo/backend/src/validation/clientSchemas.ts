import { z } from 'zod';

/** Shape the create endpoint accepts. */
export const createClientSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
});

/** Shape the update endpoint accepts. */
export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;

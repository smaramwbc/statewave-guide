/** Zod schemas for the settings endpoints. */
import { z } from 'zod';

/** Body of `PUT /settings`. */
export const updateSettingsSchema = z.object({
  organisationName: z.string().min(1).max(200),
  notificationsEnabled: z.boolean(),
  defaultPlan: z.enum(['free', 'team', 'enterprise']),
});

/** Validated body of `PUT /settings`. */
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/**
 * Settings persistence.
 *
 * Named `settingsStore`, not `settingsService`: the shape is what makes it a
 * service, not the suffix. An indexer that recognises services by name alone
 * will miss this one and will have to say so.
 */
import { query, queryOne } from '../lib/db';
import type { UpdateSettingsInput } from '../validation/settingsSchemas';

/** The one settings row. */
export interface SettingsRecord {
  organisation_name: string;
  notifications_enabled: boolean;
  default_plan: 'free' | 'team' | 'enterprise';
}

/** Settings as the API returns them. */
export interface SettingsDto {
  organisationName: string;
  notificationsEnabled: boolean;
  defaultPlan: 'free' | 'team' | 'enterprise';
}

export const settingsStore = {
  /** The editable field vocabulary. Served publicly, so no permission. */
  describe(): string[] {
    return ['organisationName', 'notificationsEnabled', 'defaultPlan'];
  },

  /** Reads the settings row, falling back to defaults. */
  async load(): Promise<SettingsDto> {
    const row = await queryOne<SettingsRecord>('select * from settings limit 1', []);
    return {
      organisationName: row?.organisation_name ?? 'Untitled organisation',
      notificationsEnabled: row?.notifications_enabled ?? true,
      defaultPlan: row?.default_plan ?? 'team',
    };
  },

  /** Writes the settings row. */
  async save(input: UpdateSettingsInput): Promise<SettingsDto> {
    await query(
      'update settings set organisation_name = $1, notifications_enabled = $2, default_plan = $3',
      [input.organisationName, input.notificationsEnabled, input.defaultPlan],
    );
    return { ...input };
  },
};

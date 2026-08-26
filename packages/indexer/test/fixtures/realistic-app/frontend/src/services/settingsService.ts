/**
 * Settings operations, written as a class.
 *
 * The third service shape, and the hardest: the HTTP client is a constructor
 * parameter rather than a module-scope binding, so proving that `this.client`
 * is the `api` instance takes one more hop than `http-client-member-call`
 * strictly covers.
 */
import { api, unwrap } from '../lib/http';
import { SETTINGS_PATH } from '../lib/constants';
import type { AxiosInstance } from 'axios';

/** Everything the settings page can edit. */
export interface Settings {
  organisationName: string;
  notificationsEnabled: boolean;
  defaultPlan: 'free' | 'team' | 'enterprise';
}

/** The rotate-key response. */
export interface ApiKey {
  apiKey: string;
  rotatedAt: string;
}

/** Settings operations. One instance is exported below. */
export class SettingsService {
  constructor(private readonly client: AxiosInstance = api) {}

  /** `GET /settings`. */
  async load(): Promise<Settings> {
    return unwrap(this.client.get<Settings>(SETTINGS_PATH));
  }

  /** `PUT /settings`. */
  async save(next: Settings): Promise<Settings> {
    return unwrap(this.client.put<Settings>(SETTINGS_PATH, next));
  }

  /**
   * `POST /settings/api-key/rotate`.
   *
   * Deliberately has no backend route in this fixture: it is the frontend-only
   * endpoint that proves the graph reports an unmatched call instead of
   * quietly inventing a handler for it.
   */
  async rotateApiKey(): Promise<ApiKey> {
    return unwrap(this.client.post<ApiKey>('/settings/api-key/rotate', {}));
  }
}

/** The instance the application uses. */
export const settingsService = new SettingsService();

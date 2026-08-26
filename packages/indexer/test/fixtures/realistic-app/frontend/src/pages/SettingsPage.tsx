/**
 * Organisation settings.
 *
 * Uses the class-based service, the legacy `data-ai-id` attribute, and the same
 * semantic id twice — a sticky footer duplicating the save button, which is how
 * duplicate ids actually happen.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../components/primitives/Button';
import { Spinner } from '../components/primitives/Spinner';
import { hasPermission } from '../permissions/permissions';
import { useSession } from '../permissions/SessionContext';
import { settingsService } from '../services/settingsService';
import type { Settings } from '../services/settingsService';

/** Shown when the browser is offline. Never written back. */
const OFFLINE_SETTINGS: Settings = {
  organisationName: 'Offline',
  notificationsEnabled: false,
  defaultPlan: 'free',
};

/** The settings page. */
export function SettingsPage() {
  const session = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  /** Fetches the current settings, or the offline stub. */
  async function loadSettings(): Promise<void> {
    setSettings(window.navigator.onLine ? await settingsService.load() : await loadOffline());
  }

  /**
   * The offline stub.
   *
   * `settingsService` here is a *local* binding that shadows the module import
   * above for the length of this function. A `calls` edge from this line to
   * `services/settingsService.ts#SettingsService.load` is a scope-table bug,
   * not a resolution: the two names have nothing to do with each other.
   */
  async function loadOffline(): Promise<Settings> {
    const settingsService = { load: async (): Promise<Settings> => OFFLINE_SETTINGS };
    return settingsService.load();
  }

  /** Native form submit. */
  const saveSettings = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (settings === null) return;
    setSettings(await settingsService.save(settings));
  };

  /** Rotates the API key. The only frontend-only endpoint in the fixture. */
  const rotateKey = async (): Promise<void> => {
    const next = await settingsService.rotateApiKey();
    setRotatedKey(next.apiKey);
  };

  const canEdit = hasPermission(session, 'settings:update');

  if (settings === null) return <Spinner label="Loading settings" />;

  return (
    <section className="page" data-guide="settings">
      <h1>Settings</h1>
      <form className="settings-form" data-guide="settings.form" onSubmit={saveSettings}>
        <label className="field" htmlFor="org-name">
          <span className="field__label">Organisation</span>
          <input
            id="org-name"
            data-guide="settings.name"
            value={settings.organisationName}
            disabled={!canEdit}
            onChange={(event) => setSettings({ ...settings, organisationName: event.target.value })}
          />
        </label>
        <label className="field field--check" htmlFor="notifications">
          <input
            id="notifications"
            data-guide="settings.notifications"
            type="checkbox"
            checked={settings.notificationsEnabled}
            disabled={!canEdit}
            onChange={(event) => setSettings({ ...settings, notificationsEnabled: event.target.checked })}
          />
          <span>Email me when an invoice is paid</span>
        </label>
        <Button data-guide="settings.save" type="submit" variant="primary" disabled={!canEdit}>
          Save changes
        </Button>
      </form>

      <section className="danger-zone" data-ai-id="settings.danger-zone">
        <h2>Danger zone</h2>
        <Button data-guide="settings.rotate-key" variant="danger" onClick={rotateKey} disabled={!canEdit}>
          Rotate API key
        </Button>
        {rotatedKey !== null ? <code data-guide="settings.new-key">{rotatedKey}</code> : null}
      </section>

      <footer className="sticky-actions">
        {/* The same semantic id as the button inside the form. */}
        <Button data-guide="settings.save" type="submit" variant="primary" form="settings-form" disabled={!canEdit}>
          Save changes
        </Button>
      </footer>
    </section>
  );
}

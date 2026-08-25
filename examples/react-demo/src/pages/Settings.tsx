import { useGuideElement } from '@statewavedev/guide-react';

/**
 * Settings.
 *
 * Uses the hook form of element registration rather than `<GuideElement>` — the
 * two are equivalent, and the hook is the better fit when you already control
 * the element and just want a ref.
 *
 * The long spacer above the notification section is deliberate: it gives
 * `scrollToElement` something real to do.
 */
export function Settings() {
  const notificationsRef = useGuideElement<HTMLElement>({
    id: 'settings.notifications',
    type: 'section',
    label: 'Notification settings',
    description: 'Controls how often the workspace sends an email digest.',
  });

  const saveRef = useGuideElement<HTMLButtonElement>({
    id: 'settings.form.save',
    type: 'button',
    label: 'Save changes',
    description: 'Persists the workspace settings.',
  });

  return (
    <main data-guide="settings" data-guide-type="section">
      <h2>Settings</h2>
      <p className="lede">Workspace preferences.</p>

      <section>
        <h3>Workspace</h3>
        <form data-guide="settings.form" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>Workspace name</span>
            <input data-guide="settings.form.name" defaultValue="Acme Consulting" />
          </label>
          <label>
            <span>Default owner</span>
            <input data-guide="settings.form.owner" defaultValue="Ada" />
          </label>
          <button ref={saveRef} className="primary" data-guide="settings.form.save" type="submit">
            Save changes
          </button>
        </form>
      </section>

      {/* Pushes the notification section below the fold so scrolling is visible. */}
      <div className="spacer" aria-hidden="true" />

      <section
        ref={notificationsRef}
        data-guide="settings.notifications"
        data-guide-label="Notification settings"
      >
        <h3>Notifications</h3>
        <label>
          <span>Email digest</span>
          <select data-guide="settings.notifications.digest" defaultValue="weekly">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="never">Never</option>
          </select>
        </label>
      </section>
    </main>
  );
}

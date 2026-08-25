export const Settings = function SettingsPage() {
  return (
    <form data-guide="settings.form">
      <input data-guide="settings.form.name" data-guide-label="Workspace name" />
      <button data-guide="settings.form.save" data-guide-type="button">Save</button>
    </form>
  );
};

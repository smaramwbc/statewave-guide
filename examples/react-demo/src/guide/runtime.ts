import { createGuideRuntime } from '@statewavedev/guide-core';

/**
 * The demo's guide runtime.
 *
 * Created once, outside React, so it survives hot reloads and so this file can
 * show what the runtime looks like without any React in the picture.
 *
 * Note how little there is here. `highlight` and `scroll` are registered by
 * `<StatewaveGuideProvider>` because they need nothing but the guidance engine;
 * `navigate` is registered only because the provider is handed a routing
 * implementation. The React package never guesses at routing.
 */
export const guide = createGuideRuntime({
  initialContext: {
    route: '/',
    userId: 'demo-user',
    workspaceId: 'demo-workspace',
    permissions: ['clients.read', 'clients.create', 'settings.write'],
  },
});

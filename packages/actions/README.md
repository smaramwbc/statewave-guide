# @statewavedev/guide-actions

The framework-independent action runtime for [Statewave Guide](https://github.com/smaramwbc/statewave-guide).

An action is a name, a description, a Zod schema, a risk level and a handler. This
package holds them, validates input, applies a risk policy, and returns a
structured result. It knows nothing about the DOM, React, or what any action
actually does.

```ts
import { createActionRegistry } from '@statewavedev/guide-actions';
import { z } from 'zod';

const actions = createActionRegistry();

actions.register({
  name: 'navigate',
  description: 'Navigate to an application route',
  risk: 'safe',
  schema: z.object({ route: z.string() }),
  execute: async ({ route }) => router.push(route),
});

const result = await actions.execute({ action: 'navigate', input: { route: '/clients' } });
if (!result.ok) console.error(result.error.code, result.error.message);
```

## Two properties that matter

**Execution never throws.** Unknown action, invalid input, a handler that
rejected, a policy refusal, a cancellation — every one comes back as
`{ ok: false, error: { code, message } }`. The caller of an action is frequently
not a human and must be able to _read_ a failure rather than catch it.

**Risk is declared and enforced.**

| Risk         | Examples                    | Default policy                                                               |
| ------------ | --------------------------- | ---------------------------------------------------------------------------- |
| `safe`       | navigate, highlight, scroll | always allowed                                                               |
| `confirm`    | save, send, archive         | agent requests refused with `confirmation_required`                          |
| `restricted` | delete, pay, sign           | refused with `not_permitted`, and hidden from `list({ visibleTo: 'agent' })` |

`restricted` actions are _invisible_ to an agent, not merely refused — an action a
model has never been told about is one it cannot be argued into naming.

The policy is a replaceable function, so a host can express role checks or a
confirmation token without forking the runtime.

## Status

Early development. No confirmation UI is shipped yet — the classification and the
enforcement point are. See the
[main README](https://github.com/smaramwbc/statewave-guide#readme).

Apache-2.0

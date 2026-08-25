# @statewavedev/guide-core

The runtime and orchestration layer for [Statewave Guide](https://github.com/smaramwbc/statewave-guide).

Core owns four things and delegates everything else: the application context, the
action registry, a knowledge port and a memory port.

It is deliberately environment-free — no DOM, no React, no HTTP client, no vendor
SDK. Everything from the outside world arrives as an interface implementation.

```ts
import {
  createGuideRuntime,
  createStaticKnowledgeProvider,
  createInMemoryMemoryProvider,
} from '@statewavedev/guide-core';

const guide = createGuideRuntime({
  actions,
  knowledgeProvider: createStaticKnowledgeProvider(productModel),
  memoryProvider: createInMemoryMemoryProvider(),
});

guide.setContext({ route: '/clients', permissions: ['clients.create'] });

await guide.searchKnowledge('how do I add a client?');
await guide.executeAction({ action: 'highlight', input: { elementId: 'clients.create' } });
guide.getAvailableActions({ visibleTo: 'agent' });
```

## The host owns the context

The host pushes route changes, permissions and the selected entity in; the runtime
and action handlers only read. Nothing an agent sends can modify it, which is what
makes the context trustworthy enough to gate guidance on.

`patchContext` distinguishes `undefined` ("leave alone") from `null` ("clear"), so
a router reporting a route change cannot erase what the auth layer reported a
moment earlier.

## Ports

| Port                | Purpose                                    | Shipped implementation                |
| ------------------- | ------------------------------------------ | ------------------------------------- |
| `KnowledgeProvider` | answers "what does this application do?"   | `createStaticKnowledgeProvider`       |
| `MemoryProvider`    | persists and recalls facts across sessions | `createInMemoryMemoryProvider`        |
| `ModelProvider`     | the seam for the future agent layer        | _none — defined, deliberately unused_ |

The in-memory implementations are not placeholders to be thrown away. They are
the reference implementations that prove each port is usable and testable before
it acquires a network dependency.

`MemoryProvider` is shaped so a Statewave adapter can implement it — `subject` is a
namespace like `user:42`, not a Statewave API concept. That adapter is a future
package. Core will not gain a dependency on it.

`ModelProvider.generate()` returns `actionRequests`, not commands. Every one still
goes through the action registry, where it is validated and risk-gated. A model
can ask for something it is not allowed to do and be refused — the intended
failure mode, not an edge case.

## Status

Early development. There is no LLM integration in this package. See the
[main README](https://github.com/smaramwbc/statewave-guide#readme).

Apache-2.0

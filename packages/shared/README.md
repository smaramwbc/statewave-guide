# @statewavedev/guide-shared

Framework-independent types and schemas for [Statewave Guide](https://github.com/smaramwbc/statewave-guide).

Every other package types against this one. It contains no runtime behaviour
beyond validation, and it imports nothing from a browser, a bundler or a UI
framework — which is what lets the Node indexer and the browser runtime agree on
exactly the same contracts.

## What's in it

- **Product Model** — `ProductFeature`, `ProductElement`, `ProvenanceReference`,
  `ProductModel`, `ProductKnowledgeResult`
- **Application context** — `AppContext`, `AppContextPatch`
- **Action contracts** — `GuideActionDefinition`, `GuideActionRequest`,
  `GuideActionResult`, `GuideActionRisk`
- **The semantic-id convention** — `GUIDE_ATTRIBUTE` (`data-guide`),
  `LEGACY_GUIDE_ATTRIBUTE` (`data-ai-id`), `isValidGuideElementId`
- **Zod schemas** for all of the above, including the built-in action inputs

## The rule this package enforces

```ts
import { isValidGuideElementId } from '@statewavedev/guide-shared';

isValidGuideElementId('clients.create'); // true
isValidGuideElementId('#app > div:nth-child(4)'); // false
```

Semantic ids are dot-separated lowercase segments. Every selector metacharacter
is rejected, so a value that could act as a CSS selector cannot exist as an id
anywhere in the system. Both the indexer and the runtime call this same function.

## Status

Early development. See the [main README](https://github.com/smaramwbc/statewave-guide#readme).

Apache-2.0

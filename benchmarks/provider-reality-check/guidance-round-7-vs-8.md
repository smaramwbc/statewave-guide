# Round 7 → Round 8: behavioural evidence

Same twenty-one features, same frozen static capture, same compiler, no provider call. What
changed is that seven capabilities were watched happening in a running browser and became claims.

## client-detail.rename

- observed: `update` at element:client-detail.rename on /clients/c1 (rename)

## clients.create

- observed: `open` at element:clients.create on /clients (open-create)

## clients.search

- observed: `filter` at element:clients.search on /clients (filter-clients)
- **purpose was:** _(withheld)_
- **purpose now:** Lets you filter clients.
- **summary was:** _(withheld)_
- **summary now:** You can filter clients.
- questions was: []
- **questions now:** ["How do I filter clients?"]

## dashboard.new-client

- observed: `navigate` at element:dashboard.new-client on /clients (dashboard-new)
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.

## nav.clients

- observed: `navigate` at element:nav.clients on /clients (nav-clients)
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.

## settings.form

- observed: `update` at element:settings.form on /settings (save-settings)
- **purpose was:** _(withheld)_
- **purpose now:** Lets you change a setting.
- **summary was:** _(withheld)_
- **summary now:** You can change a setting.
- questions was: []
- **questions now:** ["How do I change a setting?"]

## settings.rotate-key

- observed: `reveal` at element:settings.rotate-key on /settings (rotate)
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.

## Refused

- `create` at clients.export — **NO_WRITE_OBSERVED**: A create capability requires a POST request inside this interaction. Nothing disappearing from a screen is a write.
- `delete` at client-detail.delete — **NO_WRITE_OBSERVED**: A delete capability requires a DELETE request inside this interaction. Nothing disappearing from a screen is a write.
- `reveal` at client-detail.audit — **NOTHING_APPEARED**: Revealing requires an element to have appeared.
- `select` at invoices.list.open — **NAVIGATION_OCCURRED**: The route changed, so this control moved the user rather than marking a member of a collection. Navigation is its own capability.
- `clear_selection` at invoices.list.clear — **NO_SELECTION_CHANGE**: Clearing a selection requires the selected state to have gone.

---

2 of 21 features changed.

4/38 emitted propositions rest on a behavioural claim.


# Round 3 → Round 4: action selection

Same Product Model, same twenty-one features, no provider call. What changed is which verified
actions the compiler selects into the guide.

## client-detail.change-plan

- completeness: COMPLETE · task: PARTIAL
- **added:** Choose "Upgrade".

## client-detail.delete

- completeness: COMPLETE · task: PARTIAL
- **added:** Choose "Delete".

## clients.error

- completeness: ENTRY_ONLY · task: ENTRY_ONLY
- **added:** Open Clients.

## clients.export

- completeness: ACTIONABLE · task: PARTIAL
- **added:** Choose "Export CSV".

## clients.search

- completeness: ENTRY_ONLY · task: ENTRY_ONLY
- **removed:** Enter the client's search.

## invoices.create-form.submit

- completeness: COMPLETE · task: TERMINAL_ACTION_REACHED
- **added:** Open Invoices.
- **added:** Choose "Raise invoice" to create a new invoice.
- withheld (DUPLICATE_ACTION): Another claim already puts element:invoices.create-form.submit in this guide as the same kind of step.

## invoices.list.clear

- completeness: ACTIONABLE · task: PARTIAL
- **added:** Choose "Clear selection".
- **removed:** Open Client Detail.

## invoices.list.open

- completeness: ACTIONABLE · task: PARTIAL
- **added:** Choose Open.
- **removed:** Open Client Detail.

## nav.clients

- completeness: ACTIONABLE · task: PARTIAL
- **added:** Open Clients.
- **added:** Choose "Clients".

## settings.rotate-key

- completeness: ACTIONABLE · task: PARTIAL
- **added:** Choose "Rotate API key".

## settings.save

- completeness: ACTIONABLE · task: TERMINAL_ACTION_REACHED
- **added:** Open Settings.
- **added:** Choose "Save changes".

---

11 of 21 features changed.


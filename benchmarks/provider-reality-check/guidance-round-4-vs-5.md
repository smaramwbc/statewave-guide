# Round 4 → Round 5: bounded action target recovery

Same Product Model, same twenty-one features, no provider call. What changed is which verified
actions the compiler can reach, and whether a synthesised entry step restates one.

## nav.clients

- completeness: ACTIONABLE · task: PARTIAL
- **removed:** Open Clients.

## settings.form

- completeness: ACTIONABLE · task: TERMINAL_ACTION_REACHED
- **added:** Choose "Save changes".
- recovered element:settings.save from element:settings.form through `submits_to` at function:frontend/src/pages/SettingsPage.tsx#saveSettings (OWNED)
- recovered element:settings.save from element:settings.form through `submits_to` at function:frontend/src/pages/SettingsPage.tsx#saveSettings (OWNED)
- withheld (UNSUPPORTED_PRESENTATION): A submit capability with no user-visible control. Naming it would mean saying "submit the form", which describes the mechanism rather than anything the reader can see.
- withheld (DUPLICATE_ACTION): Another claim already puts element:settings.save in this guide as the same kind of step.

---

2 of 21 features changed.


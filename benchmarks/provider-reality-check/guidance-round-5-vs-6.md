# Round 5 → Round 6: semantic language authority

Same Product Model, same twenty-one features, no provider call. What changed is that no
user-facing sentence is passed through from the model any more — each is built from propositions
that carry their own support.

## api.get.partial-clients

- **purpose was:** Serves client data through a legacy route kept alongside the current client APIs.
- **purpose now:** _(none)_
- question was: Why do I get an access error when calling the older clients endpoint?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: api.get.partial-clients#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: api.get.partial-clients#user_question:1

## client-detail.audit

- **purpose was:** Lets someone reviewing a client check what changed and when, without leaving the client detail page.
- **purpose now:** Lets you view the audit trail for a client.
- question was: How do I see the history of changes for this client?
- **question now:** How do I view the audit trail for a client?
- **question now:** Why can't I see "Audit trail"?
  - `action` = view ← client-detail.audit#capability:1
  - `object` = client ← api:GET:/api/clients/:param/audit (path "/api/clients/:clientId/audit")
  - `artifact` = audit trail ← element:client-detail.audit (label "Audit trail")
  - `action` = view ← client-detail.audit#capability:1
  - `object` = client ← api:GET:/api/clients/:param/audit (path "/api/clients/:clientId/audit")
  - `artifact` = audit trail ← element:client-detail.audit (label "Audit trail")
  - `condition` = requires permission ← client-detail.audit#permission:1
  - `artifact` = Audit trail ← element:client-detail.audit (label "Audit trail")
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.audit#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.audit#user_question:1

## client-detail.change-plan

- **purpose was:** Lets an account manager move a client onto the enterprise plan without editing the record by hand.
- **purpose now:** _(none)_
- question was: How do I upgrade a client to the enterprise plan?
- **question now:** Why can't I see "Upgrade"?
  - `condition` = requires permission ← client-detail.change-plan#constraint:1
  - `artifact` = Upgrade ← element:client-detail.change-plan (label "Upgrade")
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.change-plan#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.change-plan#purpose:2
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.change-plan#user_question:1

## client-detail.delete

- **purpose was:** Removes a client record you no longer need from the client detail page.
- **purpose now:** _(none)_
- question was: Why can't I see the Delete button on a client?
- **question now:** Why can't I see "Delete"?
  - `condition` = requires permission ← client-detail.delete#permission:1
  - `artifact` = Delete ← element:client-detail.delete (label "Delete")
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.delete#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.delete#user_question:1

## client-detail.rename

- **purpose was:** Lets someone correct or change a client's display name without leaving the client detail page.
- **purpose now:** Lets you change a client.
- question was: How do I change a client's name?
- **question now:** How do I change a client?
- **question now:** Why can't I see "Rename"?
  - `action` = update ← client-detail.rename#capability:1
  - `object` = client ← api:PUT:/api/clients/:param (path "/api/clients/:clientId")
  - `action` = update ← client-detail.rename#capability:1
  - `object` = client ← api:PUT:/api/clients/:param (path "/api/clients/:clientId")
  - `condition` = requires permission ← client-detail.rename#constraint:1
  - `artifact` = Rename ← element:client-detail.rename (label "Rename")
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.rename#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: client-detail.rename#user_question:1

## clients.create

- **purpose was:** Lets an admin onboard a new client account with a name, billing email and plan.
- **purpose now:** Lets you create a new client.
- question was: How do I add a new client?
- question was: Why can't I see the New client button?
- **question now:** How do I create a new client?
  - `action` = create ← clients.create#capability:1
  - `object` = client ← api:POST:/api/clients (path "/api/clients")
  - `action` = create ← clients.create#capability:1
  - `object` = client ← api:POST:/api/clients (path "/api/clients")
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.create#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.create#user_question:1
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.create#user_question:2

## clients.error

- question was: Why am I seeing a red message on the Clients page?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.error#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: clients.error#user_question:1

## clients.export

- **purpose was:** Lets you take the client list out of the app as a CSV file for use elsewhere.
- **purpose now:** _(none)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.export#purpose:1

## clients.search

- **purpose was:** Helps you find a specific client quickly instead of scrolling the full list.
- **purpose now:** _(none)_
- question was: How do I find a particular client?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.search#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.search#user_question:1

## clients.table

- **purpose was:** The table is the main view of clients, with each row opening that client and offering a Delete action.
- **purpose now:** _(none)_
- question was: Why do I see 'You do not have access to the client list'? The table only appears for people with client read access.
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_EVIDENCE_NOT_OWNED: clients.table#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: clients.table#user_question:1

## clients.table.forbidden

- **purpose was:** Explains why the clients table appears empty for users without client read access.
- **purpose now:** _(none)_
- question was: Why can't I see the client list?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_EVIDENCE_NOT_OWNED: clients.table.forbidden#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.table.forbidden#user_question:1

## dashboard.new-client

- **purpose was:** Gives a shortcut for adding a client straight from the dashboard instead of going to the clients list first.
- **purpose now:** _(none)_
- question was: Why can't I see the New client button on my dashboard?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_EVIDENCE_NOT_OWNED: dashboard.new-client#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: dashboard.new-client#user_question:1

## invoices.create-form.submit

- **purpose was:** Lets a user record a new invoice for a client without leaving the invoices page.
- **purpose now:** Lets you create a new invoice.
- question was: Why can't I see the invoice form?
- **question now:** How do I create a new invoice?
- **question now:** Why can't I see "Raise invoice"?
  - `action` = create ← invoices.create-form.submit#capability:1
  - `object` = invoice ← api:POST:/api/invoices (path "/api/invoices")
  - `action` = create ← invoices.create-form.submit#capability:1
  - `object` = invoice ← api:POST:/api/invoices (path "/api/invoices")
  - `condition` = requires permission ← invoices.create-form.submit#permission:1
  - `artifact` = Raise invoice ← element:invoices.create-form.submit (label "Raise invoice")
  - LANGUAGE_EVIDENCE_NOT_OWNED: invoices.create-form.submit#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: invoices.create-form.submit#user_question:1

## invoices.list.clear

- **purpose was:** Resets the invoice list so no row is highlighted as active.
- **purpose now:** _(none)_
- question was: How do I stop viewing the invoice I clicked on?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: invoices.list.clear#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: invoices.list.clear#user_question:1

## invoices.list.open

- **purpose was:** The open button on an invoice row selects that invoice so its details can be viewed.
- **purpose now:** _(none)_
- question was: How do I open a specific invoice?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: invoices.list.open#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: invoices.list.open#user_question:1

## nav.clients

- **purpose was:** Gives quick access to the client list from anywhere in the app.
- **purpose now:** _(none)_
- question was: Where do I find my clients?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: nav.clients#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: nav.clients#user_question:1

## settings.danger-zone

- **purpose was:** Groups irreversible actions, such as rotating the API key, away from everyday settings.
- **purpose now:** _(none)_
- question was: Where do I rotate my API key?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.danger-zone#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.danger-zone#user_question:1

## settings.form

- **purpose was:** The settings form collects organisation name and notification preferences in one place.
- **purpose now:** _(none)_
- question was: How do I change my organisation name or turn notifications on or off?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.form#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.form#user_question:1

## settings.new-key

- **purpose was:** Shows the freshly generated API key so it can be copied before leaving the page.
- **purpose now:** _(none)_
- question was: Where do I see the API key after I rotate it?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: settings.new-key#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.new-key#user_question:1

## settings.rotate-key

- **purpose was:** Lets an admin replace the organisation's API key when the old one may be compromised.
- **purpose now:** _(none)_
- question was: How do I get a new API key?
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: settings.rotate-key#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.rotate-key#user_question:1

## settings.save

- **purpose was:** Save changes commits edits made in the settings form on the Settings page.
- **purpose now:** _(none)_
- **summary was:** You can submit a setting using "Save changes".
- **summary now:** _(none)_
- question was: Why is the Save changes button greyed out? It is disabled unless you have permission to edit settings.
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.save#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.save#user_question:1

---

21 of 21 features changed.

28/28 emitted propositions carry support that this feature owns.


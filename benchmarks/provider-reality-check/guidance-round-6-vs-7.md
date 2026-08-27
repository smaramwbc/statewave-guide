# Round 6 → Round 7: semantic language authority

Same Product Model, same twenty-one features, no provider call. What changed is that no
user-facing sentence is passed through from the model any more — each is built from propositions
that carry their own support.

## api.get.partial-clients

- **title was:** Partial clients
- **title now:** _(withheld)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: api.get.partial-clients#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: api.get.partial-clients#user_question:1

## clients.create

- steps was: ["Open Clients.","Choose \"New client\".","Enter the client's email, name and plan.","Choose \"Create client\"."]
- **steps now:** ["Open Clients.","Choose \"New client\".","Enter the client's billing email, name and plan.","Choose \"Create client\"."]
- question was: How do I create a new client?
- **question now:** How do I create a new client?
  - `action` = create ← clients.create#capability:1
  - `object` = client ← api:POST:/api/clients (path "/api/clients")
  - `action` = create ← clients.create#capability:1
  - `object` = client ← api:POST:/api/clients (path "/api/clients")
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.create#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.create#user_question:1
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.create#user_question:2

## clients.error

- **title was:** Error
- **title now:** _(withheld)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.error#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: clients.error#user_question:1

## clients.search

- **title was:** Search
- **title now:** _(withheld)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.search#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.search#user_question:1

## clients.table

- **title was:** Table
- **title now:** _(withheld)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: clients.table#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: clients.table#user_question:1

## dashboard.new-client

- **question now:** Why can't I see "New client"?
  - `condition` = requires permission ← dashboard.new-client#constraint:1
  - `artifact` = New client ← element:dashboard.new-client (label "New client")
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_EVIDENCE_NOT_OWNED: dashboard.new-client#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: dashboard.new-client#user_question:1

## invoices.list.open

- **title was:** Open
- **title now:** _(withheld)_
- steps was: ["Choose Open."]
- **steps now:** []
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: invoices.list.open#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: invoices.list.open#user_question:1

## settings.danger-zone

- **title was:** Danger zone
- **title now:** _(withheld)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: settings.danger-zone#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: settings.danger-zone#user_question:1

## settings.form

- **title was:** Form
- **title now:** _(withheld)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: settings.form#purpose:1
  - LANGUAGE_CLAIM_NOT_RENDERED: settings.form#user_question:1

## settings.new-key

- **title was:** New key
- **title now:** _(withheld)_
  - withheld `action` (PRODUCT_OVERREACH): No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.
  - LANGUAGE_CLAIM_NOT_RENDERED: settings.new-key#purpose:1
  - LANGUAGE_EVIDENCE_NOT_OWNED: settings.new-key#user_question:1

---

10 of 21 features changed.

30/30 emitted propositions carry support that this feature owns.


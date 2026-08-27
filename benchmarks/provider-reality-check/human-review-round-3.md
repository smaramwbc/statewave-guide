# Human review — Round 3

> Judge the output as if you were an end user encountering this help inside an application.
>
> Do not award points because the output is technically safe, evidence-backed, or generated
> through an impressive architecture. **The only question is whether the resulting help is
> correct and useful.**

Silence is a deliberate choice in this system. A feature that says less than you expected may be
correct to do so — judge whether what **is** said helps, and whether what is missing was needed.

## Usefulness, 0–3

- **0** — Useless. Accurate or not, this would not meaningfully help a user — repeats technical identifiers, or contains no understandable purpose or actionable guidance.
- **1** — Minimally useful. The user can roughly understand what the feature is, but guidance is incomplete, awkward, or too technical.
- **2** — Useful. A normal end user could understand the feature and get meaningful help. Accurate, understandable, sufficiently actionable.
- **3** — Excellent. Clear, concise, natural and genuinely helpful. Explains the purpose well and provides strong supported guidance without unnecessary technical language.

## Correctness

- **0** — Says something untrue of the application, judged against knownSupportedFacts.
- **1** — Acceptable: nothing untrue, but imprecise or overreaching in places.
- **2** — Strong: everything it says is supported by the facts supplied.
- **not_assessable** — No checkable facts were supplied for this item. Use this rather than 0 — it is not a judgement about the output.

## Three more dimensions, 0–2 each

`0` poor · `1` acceptable · `2` strong

- **clarity** — Would a non-technical user understand it on one read?
- **actionability** — Could a user act on it, or does it only describe?
- **naturalLanguage** — Does it read like a person wrote it for a user?

## Flags

`too_technical` · `too_vague` · `missing_capability` · `missing_workflow` · `incorrect_fact` · `irrelevant_information` · `repetitive` · `good_as_is`

---

## R01

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Form**

_The settings form collects organisation name and notification preferences in one place._

Steps:

1. Open Settings.

Questions it answers:

- How do I change my organisation name or turn notifications on or off?

### What the application actually does

- The Settings screen contains a form.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R02

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Open**

_The open button on an invoice row selects that invoice so its details can be viewed._

Steps:

1. Open Client Detail.

Questions it answers:

- How do I open a specific invoice?

### What the application actually does

_No independently checkable facts were available for this item. This says nothing about whether the output is correct — score correctness as "not_assessable"._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R03

**Screen:** Api  
**Goal:** Understand or use this feature

### What the product says

**Partial clients**

_Serves client data through a legacy route kept alongside the current client APIs._

- You need permission to do this.

Questions it answers:

- Why do I get an access error when calling the older clients endpoint?

### What the application actually does

- The application can send a GET request to ?/clients.
- Using this requires the "clients:read" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R04

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Table**

_The table is the main view of clients, with each row opening that client and offering a Delete action._

Steps:

1. Open Clients.

Questions it answers:

- Why do I see 'You do not have access to the client list'? The table only appears for people with client read access.

### What the application actually does

- The Clients screen contains a table.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R05

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**New key**

_Shows the freshly generated API key so it can be copied before leaving the page._

Steps:

1. Open Settings.

Questions it answers:

- Where do I see the API key after I rotate it?

### What the application actually does

- The Settings screen contains a read-only code display.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R06

**Screen:** Nav  
**Goal:** Understand or use this feature

### What the product says

**Clients**

Open Clients.

_Gives quick access to the client list from anywhere in the app._

Questions it answers:

- Where do I find my clients?

### What the application actually does

- The screen has a control labelled "New client".
- The screen has a control labelled "Export CSV".
- The screen has a control labelled "Refresh".
- The Nav screen contains a text input.
- The screen has a control labelled "Clients".
- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R07

**Screen:** Dashboard  
**Goal:** Understand or use this feature

### What the product says

**New client**

_Gives a shortcut for adding a client straight from the dashboard instead of going to the clients list first._

Steps:

1. Open Dashboard.

- You need permission to do this.

Questions it answers:

- Why can't I see the New client button on my dashboard?

### What the application actually does

- Using this requires the "clients:create" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R08

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Danger zone**

_Groups irreversible actions, such as rotating the API key, away from everyday settings._

Steps:

1. Open Settings.

Questions it answers:

- Where do I rotate my API key?

### What the application actually does

_No independently checkable facts were available for this item. This says nothing about whether the output is correct — score correctness as "not_assessable"._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R09

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Rename**

You can change a client using "Rename".

_Lets someone correct or change a client's display name without leaving the client detail page._

Steps:

1. Open Client Detail.
2. Choose "Rename".

- You need permission to change a client.

Questions it answers:

- How do I change a client's name?

### What the application actually does

- The application can send a PUT request to /api/clients/:clientId.
- The screen has a control labelled "Rename".
- Using this requires the "clients:update" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R10

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Search**

_Helps you find a specific client quickly instead of scrolling the full list._

Steps:

1. Open Clients.
2. Enter the client's search.

Questions it answers:

- How do I find a particular client?

### What the application actually does

- The Clients screen contains a text input.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R11

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Error**

Questions it answers:

- Why am I seeing a red message on the Clients page?

### What the application actually does

_No independently checkable facts were available for this item. This says nothing about whether the output is correct — score correctness as "not_assessable"._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R12

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Audit trail**

You can view a client using "Audit trail".

_Lets someone reviewing a client check what changed and when, without leaving the client detail page._

Steps:

1. Open Client Detail.
2. Choose "Audit trail".

- You need permission to view a client.

Questions it answers:

- How do I see the history of changes for this client?

### What the application actually does

- The application can send a GET request to /api/clients/:clientId/audit.
- The screen has a control labelled "Audit trail".
- Using this requires the "clients:read" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R13

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Raise invoice**

You can create a new invoice using "Raise invoice".

_Lets a user record a new invoice for a client without leaving the invoices page._

- You need permission to create an invoice.

Questions it answers:

- Why can't I see the invoice form?

### What the application actually does

- The application can send a POST request to /api/invoices.
- The screen has a control labelled "Raise invoice".
- Using this requires the "invoices:create" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R14

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Export CSV**

_Lets you take the client list out of the app as a CSV file for use elsewhere._

Steps:

1. Open Clients.

### What the application actually does

- The screen has a control labelled "Export CSV".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R15

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Clear selection**

_Resets the invoice list so no row is highlighted as active._

Steps:

1. Open Client Detail.

Questions it answers:

- How do I stop viewing the invoice I clicked on?

### What the application actually does

- The screen has a control labelled "Clear selection".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R16

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Save changes**

_Save changes commits edits made in the settings form on the Settings page._

Questions it answers:

- Why is the Save changes button greyed out? It is disabled unless you have permission to edit settings.

### What the application actually does

- The screen has a control labelled "Save changes".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R17

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**New client**

You can create a new client using "New client".

_Lets an admin onboard a new client account with a name, billing email and plan._

Steps:

1. Open Clients.
2. Choose "New client".
3. Enter the client's email, name and plan.
4. Choose "Create client".

- You need permission to create a client.

Questions it answers:

- How do I add a new client?
- Why can't I see the New client button?

### What the application actually does

- The application can send a POST request to /api/clients.
- The screen has a control labelled "New client".
- The screen has a control labelled "Cancel".
- The Clients screen contains a text input.
- The Clients screen contains a form.
- The Clients screen contains a dropdown.
- The screen has a control labelled "Create client".
- Using this requires the "clients:create" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R18

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**You do not have access to the client list.**

_Explains why the clients table appears empty for users without client read access._

Steps:

1. Open Clients.

Questions it answers:

- Why can't I see the client list?

### What the application actually does

- The screen has a control labelled "You do not have access to the client list.".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R19

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Upgrade**

_Lets an account manager move a client onto the enterprise plan without editing the record by hand._

Steps:

1. Open Client Detail.

- You need permission to do this.

Questions it answers:

- How do I upgrade a client to the enterprise plan?

### What the application actually does

- The screen has a control labelled "Upgrade".
- Using this requires the "clients:update" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R20

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Delete**

_Removes a client record you no longer need from the client detail page._

Steps:

1. Open Client Detail.

- You need permission to do this.

Questions it answers:

- Why can't I see the Delete button on a client?

### What the application actually does

- The screen has a control labelled "Delete".
- Using this requires the "clients:delete" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R21

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Rotate API key**

_Lets an admin replace the organisation's API key when the old one may be compromised._

Steps:

1. Open Settings.

Questions it answers:

- How do I get a new API key?

### What the application actually does

- The screen has a control labelled "Rotate API key".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---


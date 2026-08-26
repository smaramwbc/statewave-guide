# Human review — Round 2

> Judge the output as if you were an end user encountering this help inside an application.
>
> Do not award points because the output is technically safe, evidence-backed, or generated
> through an impressive architecture. **The only question is whether the resulting help is
> correct and useful.**

Record your scores in `human-review-round-2.json` — every item, no nulls left — then run
`pnpm benchmark:human-review --file <your-copy>.json`.

## Usefulness, 0–3

- **0** — Useless. Accurate or not, this would not meaningfully help a user — repeats technical identifiers, says "use clients.create", or contains no understandable purpose or actionable guidance.
- **1** — Minimally useful. The user can roughly understand what the feature is, but guidance is incomplete, awkward, or too technical.
- **2** — Useful. A normal end user could understand the feature and get meaningful help. Accurate, understandable, sufficiently actionable.
- **3** — Excellent. Clear, concise, natural and genuinely helpful. Explains the purpose well and provides strong supported guidance without unnecessary technical language.

## Four dimensions, 0–2 each

`0` poor · `1` acceptable · `2` strong

- **correctness** — Does it say anything untrue of the application, judged against knownSupportedFacts?
- **clarity** — Would a non-technical user understand it on one read?
- **actionability** — Could a user act on it, or does it only describe?
- **naturalLanguage** — Does it read like a person wrote it for a user?

## Flags

`too_technical` · `too_vague` · `missing_capability` · `missing_workflow` · `incorrect_fact` · `irrelevant_information` · `repetitive` · `good_as_is`

---

## R01

**Screen:** Api  
**Goal:** Understand or use this feature

### What the product says

**Legacy client list endpoint**

Input is validated before it is accepted.

_Serves client data to older callers under the same read permission as the current client endpoints._

Questions it answers:

- Why is my legacy client request denied?

_No steps were produced for this feature._

### What the application actually does

- The application can send a GET request to ?/clients.
- Using this requires the "clients:read" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R02

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Save changes to settings**

You can submit the setting form from the Settings screen.

_Confirms edits made on the Settings page, such as organisation name and notification preference._

Questions it answers:

- How do I save my settings changes?

_No steps were produced for this feature._

### What the application actually does

- The screen has a control labelled "Save changes".
- Submitting "Save changes" sends its form.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R03

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Settings form**

You can submit the setting form from the Settings screen.

_Lets an administrator update organisation settings from one form and save them._

Questions it answers:

- How do I change my organisation name or turn notifications on or off?

_No steps were produced for this feature._

### What the application actually does

- A form on this screen can be submitted.

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

**Export CSV from clients list**

No capability, route or permission has been verified for this feature.

_Lets you take the client list out of the app as a CSV file for use elsewhere._

Steps:

- On the Clients page, select Export CSV to export the client list.

### What the application actually does

- The screen has a control labelled "Export CSV".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R05

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Add a new client**

You can create a new client and submit the client form.

Questions it answers:

- How do I add a new client?
- Why can't I see the New client button?

Steps:

- The client form asks for a name, billing email and plan, and offers Cancel or Create client.
- The new client dialog holds the form used to enter the client's details.
- Selecting "New client" opens the create client dialog.

### What the application actually does

- The application can send a POST request to /api/clients.
- The screen has a control labelled "New client".
- The screen has a control labelled "Cancel".
- The screen has a control labelled "Create client".
- Using this requires the "clients:create" permission.
- A form on this screen can be submitted.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R06

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Rotate API key**

No capability, route or permission has been verified for this feature.

_Replaces the organisation's existing API key with a new one shown on the Settings page._

Questions it answers:

- How do I get a new API key?

Steps:

- In the Settings danger zone, choose "Rotate API key" to replace the current API key.

### What the application actually does

- The screen has a control labelled "Rotate API key".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R07

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Client list table**

No capability, route or permission has been verified for this feature.

_Displays clients in rows so you can scan the list and open one for details._

Questions it answers:

- Why can't I see the client list?

Steps:

- The client list is shown as a table of client rows on the clients page.

### What the application actually does

_Nothing was established about this feature._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R08

**Screen:** Dashboard  
**Goal:** Understand or use this feature

### What the product says

**New client button on the dashboard**

Input is validated before it is accepted.

_Gives a shortcut from the dashboard for adding a client without first opening the clients list._

Questions it answers:

- Why can't I see the New client button?

Steps:

- Starting from the dashboard, you begin adding a client by selecting "New client".

### What the application actually does

- Using this requires the "clients:create" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R09

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Search clients**

No capability, route or permission has been verified for this feature.

_Helps you find a specific client without scrolling the whole list._

Questions it answers:

- How do I find a client by name?

Steps:

- Type into the search box on the Clients page to narrow the client list.

### What the application actually does

_Nothing was established about this feature._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R10

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Clear selection in invoice list**

No capability, route or permission has been verified for this feature.

_Lets you step back from a highlighted invoice without picking another one._

Questions it answers:

- How do I deselect the invoice I clicked on?

Steps:

- Choose "Clear selection" above the invoice list to drop the currently selected invoice.

### What the application actually does

- The screen has a control labelled "Clear selection".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R11

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Danger Zone (API Key Rotation)**

No capability, route or permission has been verified for this feature.

_Groups risky, irreversible account actions apart from ordinary settings fields so they are harder to trigger by accident._

Questions it answers:

- How do I rotate my API key?

Steps:

- The Settings page includes a separate danger zone section for high-risk actions such as rotating the API key.

### What the application actually does

_Nothing was established about this feature._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R12

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Open an invoice from the list**

No capability, route or permission has been verified for this feature.

_Lets you pick an invoice from the list to view its details._

Questions it answers:

- How do I open a specific invoice from the invoice list?

Steps:

- Select an invoice row in the list to open that invoice.

### What the application actually does

_Nothing was established about this feature._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R13

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Upgrade a client's plan**

Input is validated before it is accepted.

_Lets an account manager move a client onto the enterprise plan without editing the record by hand._

Questions it answers:

- How do I upgrade a client to the enterprise plan?
- Why can't I see the Upgrade button on a client?

Steps:

- Select Upgrade on the client detail page to move the client onto the enterprise plan.

### What the application actually does

- The screen has a control labelled "Upgrade".
- Using this requires the "clients:update" permission.

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

**Client list error message**

No capability, route or permission has been verified for this feature.

_Tells you the client list failed to load rather than leaving the page blank._

Questions it answers:

- Why is my client list not loading?

_No steps were produced for this feature._

### What the application actually does

_Nothing was established about this feature._

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

**Raise invoice**

You can create a new invoices create form and submit the invoices create form form from the Invoices screen.

_Lets a user record a new invoice for a client without leaving the Invoices page._

Questions it answers:

- Why can't I see the invoice form?

_No steps were produced for this feature._

### What the application actually does

- The application can send a POST request to /api/invoices.
- The screen has a control labelled "Raise invoice".
- Using this requires the "invoices:create" permission.
- Submitting "Raise invoice" sends its form.
- Doing this sends a POST request to /api/invoices.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R16

**Screen:** Nav  
**Goal:** Understand or use this feature

### What the product says

**Clients Navigation Link**

You can open nav clients from the Clients screen.

_Gives quick access to the client list from anywhere in the app._

Questions it answers:

- Where do I find my clients?

_No steps were produced for this feature._

### What the application actually does

- The screen has a control labelled "Clients".
- "Clients" takes the user to /clients.
- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R17

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Rename a client**

You can update a client detail rename.

_Lets an authorised user correct or update the name shown for a client._

Questions it answers:

- How do I change a client's name?

Steps:

- Selecting Rename saves the new client name and reloads the client details.

### What the application actually does

- The application can send a PUT request to /api/clients/:clientId.
- The screen has a control labelled "Rename".
- Using this requires the "clients:update" permission.
- Doing this sends a PUT request to /api/clients/:clientId.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R18

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Delete a client**

Input is validated before it is accepted.

_Lets an authorised user remove a client record from the client's own detail page._

Questions it answers:

- Why can't I see the Delete button on a client?

Steps:

- Select Delete on the client detail page to begin removing the client.

### What the application actually does

- The screen has a control labelled "Delete".
- Using this requires the "clients:delete" permission.

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

**Client audit trail**

You can view client detail audit.

_Lets someone check what has changed on a client account and when._

Questions it answers:

- How do I see the history of changes for this client?

Steps:

- Select Audit trail on a client to load that client's recorded history.

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

## R20

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**New API key display**

No capability, route or permission has been verified for this feature.

_Shows the newly generated API key so it can be copied after rotation._

Questions it answers:

- Where do I find my new API key after rotating it?

Steps:

- The new API key appears on the Settings page in the danger zone after the key is rotated.

### What the application actually does

_Nothing was established about this feature._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R21

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Client list access notice**

No capability, route or permission has been verified for this feature.

_Explains why the client table is empty by telling the user they lack access to the client list._

Questions it answers:

- Why can't I see any clients on the Clients page?

Steps:

- If you lack access to the client list, the table area shows the message "You do not have access to the client list."

### What the application actually does

- The screen has a control labelled "You do not have access to the client list.".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---


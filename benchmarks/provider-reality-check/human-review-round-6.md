# Human review — Round 6

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

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**Search**

Steps:

1. Open Clients.

### What the application actually does

- The Clients screen contains a text input.
- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R02

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Audit trail**

You can view a client using "Audit trail".

_Lets you view the audit trail for a client._

Steps:

1. Open Client Detail.
2. Choose "Audit trail".

- You need permission to view a client.

Questions it answers:

- How do I view the audit trail for a client?
- Why can't I see "Audit trail"?

### What the application actually does

- The application can send a GET request to /api/clients/:clientId/audit.
- The screen has a control labelled "Audit trail".
- Using this requires the "clients:read" permission.
- There is a screen at /clients/:clientId.

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

**Rotate API key**

Steps:

1. Open Settings.
2. Choose "Rotate API key".

### What the application actually does

- The screen has a control labelled "Rotate API key".
- There is a screen at /settings.

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

Steps:

1. Open Clients.

### What the application actually does

- The Clients screen contains a table.
- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R05

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Upgrade**

Steps:

1. Open Client Detail.
2. Choose "Upgrade".

- You need permission to do this.

Questions it answers:

- Why can't I see "Upgrade"?

### What the application actually does

- The screen has a control labelled "Upgrade".
- Using this requires the "clients:update" permission.
- There is a screen at /clients/:clientId.

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

Steps:

1. Choose "Clients".

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

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**New key**

Steps:

1. Open Settings.

### What the application actually does

- The Settings screen contains a read-only code display.
- There is a screen at /settings.

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

**New client**

Steps:

1. Open Dashboard.

- You need permission to do this.

### What the application actually does

- Using this requires the "clients:create" permission.
- There is a screen at /.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R09

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Danger zone**

Steps:

1. Open Settings.

### What the application actually does

- There is a screen at /settings.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R10

**Screen:** Client-detail  
**Goal:** Understand or use this feature

### What the product says

**Delete**

Steps:

1. Open Client Detail.
2. Choose "Delete".

- You need permission to do this.

Questions it answers:

- Why can't I see "Delete"?

### What the application actually does

- The screen has a control labelled "Delete".
- Using this requires the "clients:delete" permission.
- There is a screen at /clients/:clientId.

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

**You do not have access to the client list.**

Steps:

1. Open Clients.

### What the application actually does

- The screen has a control labelled "You do not have access to the client list.".
- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R12

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

**New client**

You can create a new client using "New client".

_Lets you create a new client._

Steps:

1. Open Clients.
2. Choose "New client".
3. Enter the client's email, name and plan.
4. Choose "Create client".

- You need permission to create a client.

Questions it answers:

- How do I create a new client?

### What the application actually does

- The application can send a POST request to /api/clients.
- The screen has a control labelled "New client".
- The screen has a control labelled "Cancel".
- The Clients screen contains a text input.
- The Clients screen contains a form.
- The Clients screen contains a dropdown.
- The screen has a control labelled "Create client".
- Using this requires the "clients:create" permission.
- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R13

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Form**

Steps:

1. Open Settings.
2. Choose "Save changes".

### What the application actually does

- The Settings screen contains a form.
- The screen has a control labelled "Save changes".
- There is a screen at /settings.

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

**Error**

Steps:

1. Open Clients.

### What the application actually does

- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R15

**Screen:** Api  
**Goal:** Understand or use this feature

### What the product says

**Partial clients**

- You need permission to do this.

### What the application actually does

- The application can send a GET request to ?/clients.
- Using this requires the "clients:read" permission.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R16

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Open**

Steps:

1. Choose Open.

### What the application actually does

_No independently checkable facts were available for this item. This says nothing about whether the output is correct — score correctness as "not_assessable"._

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R17

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

**Save changes**

Steps:

1. Open Settings.
2. Choose "Save changes".

### What the application actually does

- The screen has a control labelled "Save changes".
- There is a screen at /settings.

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

**Export CSV**

Steps:

1. Open Clients.
2. Choose "Export CSV".

### What the application actually does

- The screen has a control labelled "Export CSV".
- There is a screen at /clients.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R19

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Raise invoice**

You can create a new invoice using "Raise invoice".

_Lets you create a new invoice._

Steps:

1. Open Invoices.
2. Choose "Raise invoice" to create a new invoice.

- You need permission to create an invoice.

Questions it answers:

- How do I create a new invoice?
- Why can't I see "Raise invoice"?

### What the application actually does

- The application can send a POST request to /api/invoices.
- The screen has a control labelled "Raise invoice".
- Using this requires the "invoices:create" permission.
- There is a screen at /invoices.

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

**Rename**

You can change a client using "Rename".

_Lets you change a client._

Steps:

1. Open Client Detail.
2. Choose "Rename".

- You need permission to change a client.

Questions it answers:

- How do I change a client?
- Why can't I see "Rename"?

### What the application actually does

- The application can send a PUT request to /api/clients/:clientId.
- The screen has a control labelled "Rename".
- Using this requires the "clients:update" permission.
- There is a screen at /clients/:clientId.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R21

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

**Clear selection**

Steps:

1. Choose "Clear selection".

### What the application actually does

- The screen has a control labelled "Clear selection".

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---


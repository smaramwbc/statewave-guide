# Human review — Round 8 (revision 1)

Supersedes `human-review-round-8` — RUNTIME_REVIEW_FACT_ATTRIBUTION_DEFECT.
The twenty-one product outputs are identical to the issued package. Only the observed-behaviour
entries under "What the application actually does" changed, and only because the issued ones
misattributed the interaction that produced them.

## R01

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

## R02

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

## R03

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

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

## R04

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

## R05

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
- Activating the control labelled "Rotate API key" made an element appear that was not there before.
- Activating the control labelled "Rotate API key" sent a POST request to /api/settings/api-key/rotate, which succeeded.
- All of this was observed on the /settings screen, with these permissions granted: clients:create, clients:delete, clients:read, clients:update, invoices:create, invoices:read, settings:update.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R06

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

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

## R07

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

## R08

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

## R09

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
- Activating the control labelled "Rename" sent a GET request to /api/clients/c1, which succeeded.
- Activating the control labelled "Rename" sent a PUT request to /api/clients/c1, which succeeded.
- All of this was observed on the /clients/c1 screen, with these permissions granted: clients:create, clients:delete, clients:read, clients:update, invoices:create, invoices:read, settings:update.

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

You can filter clients.

_Lets you filter clients._

Steps:

1. Open Clients.

Questions it answers:

- How do I filter clients?

### What the application actually does

- The Clients screen contains a text input.
- There is a screen at /clients.
- Typing into an unnamed text input on this screen reduced the number of items in a table on the screen from 5 items to 2.
- Typing into an unnamed text input on this screen sent a GET request to /api/clients, which succeeded.
- All of this was observed on the /clients screen, with these permissions granted: clients:create, clients:delete, clients:read, clients:update, invoices:create, invoices:read, settings:update.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R11

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

## R12

**Screen:** Invoices  
**Goal:** Understand or use this feature

### What the product says

### What the application actually does

_No independently checkable facts were available for this item. This says nothing about whether the output is correct — score correctness as "not_assessable"._

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

You can change a setting.

_Lets you change a setting._

Steps:

1. Open Settings.
2. Choose "Save changes".

Questions it answers:

- How do I change a setting?

### What the application actually does

- The Settings screen contains a form.
- The screen has a control labelled "Save changes".
- There is a screen at /settings.
- Submitting an unnamed form on this screen sent a PUT request to /api/settings, which succeeded.
- All of this was observed on the /settings screen, with these permissions granted: clients:create, clients:delete, clients:read, clients:update, invoices:create, invoices:read, settings:update.

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

**New client**

You can create a new client using "New client".

_Lets you create a new client._

Steps:

1. Open Clients.
2. Choose "New client".
3. Enter the client's billing email, name and plan.
4. Choose "Create client".

- You need permission to create a client.

Questions it answers:

- How do I create a new client?

### What the application actually does

- The application can send a POST request to /api/clients.
- The screen has a control labelled "New client".
- The screen has a control labelled "Clients appear in the list as soon as they are created.".
- The screen has a control labelled "Cancel".
- The screen has a control labelled "Billing email".
- The Clients screen contains a form.
- The screen has a control labelled "Name".
- The screen has a control labelled "Plan".
- The screen has a control labelled "Create client".
- Using this requires the "clients:create" permission.
- There is a screen at /clients.
- Activating the control labelled "New client" made an element appear that was not there before.
- Activating the control labelled "New client" made a contentinfo appear on the screen.
- Activating the control labelled "New client" made a dialog appear on the screen.
- Activating the control labelled "New client" made a form appear on the screen.
- All of this was observed on the /clients screen, with these permissions granted: clients:create, clients:delete, clients:read, clients:update, invoices:create, invoices:read, settings:update.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---

## R15

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

## R16

**Screen:** Dashboard  
**Goal:** Understand or use this feature

### What the product says

**New client**

Steps:

1. Open Dashboard.

- You need permission to do this.

Questions it answers:

- Why can't I see "New client"?

### What the application actually does

- The screen has a control labelled "New client".
- Using this requires the "clients:create" permission.
- There is a screen at /.
- Activating the control labelled "New client" made an element appear that was not there before.
- Activating the control labelled "New client" sent a GET request to /api/clients, which succeeded.
- Activating the control labelled "New client" made a banner appear on the screen.
- Activating the control labelled "New client" made a region appear on the screen.
- Activating the control labelled "New client" made a table appear on the screen.
- Activating the control labelled "New client" moved the screen from / to /clients.
- All of this was observed on the /clients screen, with these permissions granted: clients:create, clients:delete, clients:read, clients:update, invoices:create, invoices:read, settings:update.

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

## R18

**Screen:** Api  
**Goal:** Understand or use this feature

### What the product says

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

## R19

**Screen:** Clients  
**Goal:** Understand or use this feature

### What the product says

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

## R20

**Screen:** Settings  
**Goal:** Understand or use this feature

### What the product says

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

## R21

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
- Activating the control labelled "Clients" made an element appear that was not there before.
- Activating the control labelled "Clients" sent a GET request to /api/clients, which succeeded.
- Activating the control labelled "Clients" made a banner appear on the screen.
- Activating the control labelled "Clients" made a region appear on the screen.
- Activating the control labelled "Clients" made a table appear on the screen.
- Activating the control labelled "Clients" made a toolbar appear on the screen.
- Activating the control labelled "Clients" moved the screen from /settings to /clients.
- All of this was observed on the /clients screen, with these permissions granted: clients:create, clients:delete, clients:read, clients:update, invoices:create, invoices:read, settings:update.

| usefulness | correctness | clarity | actionability | naturalLanguage |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Flags: 

Note: 

---


# Round 2 renderer vs Round 3 guidance compiler

Same features, same ProductModel, same underlying facts. Only the presentation changed.

## api.get.partial-clients

**Before**

- title: Legacy client list endpoint
- description: Input is validated before it is accepted.

**After**

- title: Partial clients
- summary: (omitted)
- condition: You need permission to do this.
- completeness: DESCRIPTIVE

## client-detail.audit

**Before**

- title: Client audit trail
- description: You can view client detail audit.
- step: Select Audit trail on a client to load that client's recorded history.

**After**

- title: Audit trail
- summary: You can view a client using "Audit trail".
- step: Open Client Detail.
- step: Choose "Audit trail".
- condition: You need permission to view a client.
- completeness: COMPLETE

## client-detail.change-plan

**Before**

- title: Upgrade a client's plan
- description: Input is validated before it is accepted.
- step: Select Upgrade on the client detail page to move the client onto the enterprise plan.

**After**

- title: Upgrade
- summary: (omitted)
- step: Open Client Detail.
- condition: You need permission to do this.
- completeness: COMPLETE

## client-detail.delete

**Before**

- title: Delete a client
- description: Input is validated before it is accepted.
- step: Select Delete on the client detail page to begin removing the client.

**After**

- title: Delete
- summary: (omitted)
- step: Open Client Detail.
- condition: You need permission to do this.
- completeness: COMPLETE

## client-detail.rename

**Before**

- title: Rename a client
- description: You can update a client detail rename.
- step: Selecting Rename saves the new client name and reloads the client details.

**After**

- title: Rename
- summary: You can change a client using "Rename".
- step: Open Client Detail.
- step: Choose "Rename".
- condition: You need permission to change a client.
- completeness: COMPLETE

## clients.create

**Before**

- title: Add a new client
- description: You can create a new client and submit the client form.
- step: The client form asks for a name, billing email and plan, and offers Cancel or Create client.
- step: The new client dialog holds the form used to enter the client's details.
- step: Selecting "New client" opens the create client dialog.

**After**

- title: New client
- summary: You can create a new client using "New client".
- step: Open Clients.
- step: Choose "New client".
- step: Enter the client's email, name and plan.
- step: Choose "Create client".
- condition: You need permission to create a client.
- completeness: COMPLETE

## clients.error

**Before**

- title: Client list error message
- description: No capability, route or permission has been verified for this feature.

**After**

- title: Error
- summary: (omitted)
- completeness: IDENTIFICATION_ONLY

## clients.export

**Before**

- title: Export CSV from clients list
- description: No capability, route or permission has been verified for this feature.
- step: On the Clients page, select Export CSV to export the client list.

**After**

- title: Export CSV
- summary: (omitted)
- step: Open Clients.
- completeness: ACTIONABLE

## clients.search

**Before**

- title: Search clients
- description: No capability, route or permission has been verified for this feature.
- step: Type into the search box on the Clients page to narrow the client list.

**After**

- title: Search
- summary: (omitted)
- step: Open Clients.
- step: Enter the client's search.
- completeness: ACTIONABLE

## clients.table

**Before**

- title: Client list table
- description: No capability, route or permission has been verified for this feature.
- step: The client list is shown as a table of client rows on the clients page.

**After**

- title: Table
- summary: (omitted)
- step: Open Clients.
- completeness: ACTIONABLE

## clients.table.forbidden

**Before**

- title: Client list access notice
- description: No capability, route or permission has been verified for this feature.
- step: If you lack access to the client list, the table area shows the message "You do not have access to the client list."

**After**

- title: You do not have access to the client list.
- summary: (omitted)
- step: Open Clients.
- completeness: ACTIONABLE

## dashboard.new-client

**Before**

- title: New client button on the dashboard
- description: Input is validated before it is accepted.
- step: Starting from the dashboard, you begin adding a client by selecting "New client".

**After**

- title: New client
- summary: (omitted)
- step: Open Dashboard.
- condition: You need permission to do this.
- completeness: COMPLETE

## invoices.create-form.submit

**Before**

- title: Raise invoice
- description: You can create a new invoices create form and submit the invoices create form form from the Invoices screen.

**After**

- title: Raise invoice
- summary: You can create a new invoice using "Raise invoice".
- condition: You need permission to create an invoice.
- completeness: COMPLETE

## invoices.list.clear

**Before**

- title: Clear selection in invoice list
- description: No capability, route or permission has been verified for this feature.
- step: Choose "Clear selection" above the invoice list to drop the currently selected invoice.

**After**

- title: Clear selection
- summary: (omitted)
- step: Open Client Detail.
- completeness: ACTIONABLE

## invoices.list.open

**Before**

- title: Open an invoice from the list
- description: No capability, route or permission has been verified for this feature.
- step: Select an invoice row in the list to open that invoice.

**After**

- title: Open
- summary: (omitted)
- step: Open Client Detail.
- completeness: ACTIONABLE

## nav.clients

**Before**

- title: Clients Navigation Link
- description: You can open nav clients from the Clients screen.

**After**

- title: Clients
- summary: Open Clients.
- completeness: ACTIONABLE

## settings.danger-zone

**Before**

- title: Danger Zone (API Key Rotation)
- description: No capability, route or permission has been verified for this feature.
- step: The Settings page includes a separate danger zone section for high-risk actions such as rotating the API key.

**After**

- title: Danger zone
- summary: (omitted)
- step: Open Settings.
- completeness: ACTIONABLE

## settings.form

**Before**

- title: Settings form
- description: You can submit the setting form from the Settings screen.

**After**

- title: Form
- summary: (omitted)
- step: Open Settings.
- completeness: ACTIONABLE

## settings.new-key

**Before**

- title: New API key display
- description: No capability, route or permission has been verified for this feature.
- step: The new API key appears on the Settings page in the danger zone after the key is rotated.

**After**

- title: New key
- summary: (omitted)
- step: Open Settings.
- completeness: ACTIONABLE

## settings.rotate-key

**Before**

- title: Rotate API key
- description: No capability, route or permission has been verified for this feature.
- step: In the Settings danger zone, choose "Rotate API key" to replace the current API key.

**After**

- title: Rotate API key
- summary: (omitted)
- step: Open Settings.
- completeness: ACTIONABLE

## settings.save

**Before**

- title: Save changes to settings
- description: You can submit the setting form from the Settings screen.

**After**

- title: Save changes
- summary: (omitted)
- completeness: DESCRIPTIVE


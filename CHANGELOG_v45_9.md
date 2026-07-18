# DOT ALMASIAH ERP v45.9 — Safe Maintenance

## Scope
Maintenance-only release. No approved visual layout, workflow, or historical data was changed.

## Changes
- Added Firestore `keys().hasOnly()` validation for supervisor-created regular sales and change requests.
- Preserved owner flexibility for purchases and expenses to avoid blocking existing production fields.
- Added validation for supervisor display name, email, order number, target sale ID, and target order number.
- Renamed the three genuinely duplicated static `v21-styles` IDs to unique identifiers.
- Left conditional/dynamic IDs unchanged where only one element exists at runtime.
- Added an archived reference copy of the standalone legacy localStorage dashboard.
- Kept the root legacy file for backward compatibility; the active production broadcaster dashboard remains cloud-backed through `dashboard.html` and `cloud-bridge.js`.

## Data safety
- No migrations were executed.
- No Firestore documents were modified.
- No historical JSON or broadcaster records were changed.

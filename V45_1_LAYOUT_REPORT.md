# V45.1 Owner Dashboard Layout Report

## Scope
Presentation-only refinement plus a shortcut to the existing pending-approval workflow.

## Layout changes
- Mobile KPI card minimum height: 116px.
- Desktop KPI card minimum height: 126px.
- Reduced padding and gaps while preserving readability.
- Owner page bottom clearance: 148px on mobile.
- Final total-profit card remains full width.

## Approval card
- Reads pending operations from the existing `DOT_CLOUD.state.sales`.
- Counts only non-historical records with `status = pending`.
- Opens the existing `cloudSales` route.
- Does not create, edit, approve or delete any operation.

## Validation
- Inline JavaScript blocks checked: 2
- Protected project files unchanged: 7
- Firestore migration code preserved.
- Supervisor dashboard unchanged.

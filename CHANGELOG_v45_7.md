# v45.7 — Supervisor Local Today

## Fixed
- Supervisor daily filter now uses the device's local calendar date instead of UTC.
- The supervisor dashboard follows the current local day automatically.
- New-sale forms default to the current local day.
- After a successful sale, the date field refreshes to the current local day.
- Sale order numbers also use the local calendar day.

## Manual history
- The supervisor can still choose an earlier date manually.
- Returning the filter to today's date resumes automatic daily following.

## Unchanged
- Sales, stock, target and profit calculations.
- Owner dashboard and v45.6 layout.
- Firestore synchronization, migration and security rules.

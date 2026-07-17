# v44 — Broadcaster Firestore Migration

## Architecture
- Firestore is now the source of truth for broadcaster data.
- localStorage remains as an offline cache and rollback layer.
- historical-data.json remains an untouched recovery seed.

## Migrated datasets
- broadcasterCommissions
- broadcasterAliases
- importBatches
- lockedMonths
- appSettings, including broadcaster profiles

## Safety
- Automatic local snapshot before first migration.
- One-time migration marker: migrations/broadcaster_v44.
- Deterministic document IDs prevent duplicate records.
- Post-upload verification compares counts and stable checksums.
- Migration is marked complete only after verification passes.
- Existing cloud data is loaded instead of overwritten when migration is already complete.
- Firestore listeners keep the local cache current across devices.

## Unchanged
- Sales, purchases, expenses, authentication and supervisor workflows.
- firestore.rules; the required owner-only rules already existed.
- historical-data.json and backup files.
- legacy-dashboard.html.

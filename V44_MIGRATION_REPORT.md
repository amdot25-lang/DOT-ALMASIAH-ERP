# V44 Broadcaster Firestore Migration Report

## Preserved source data
- Broadcaster commission records: 853
- Alias groups: 16
- Import batches: 3
- Locked months: 0
- historical-data.json SHA-256 unchanged: yes
- BACKUP_SUMMARY.json SHA-256 unchanged: yes

## Runtime flow
1. The owner signs in.
2. A local snapshot is created automatically.
3. The app checks `migrations/broadcaster_v44`.
4. When no completed marker exists, the current local broadcaster datasets are uploaded.
5. Firestore data is read back.
6. Counts and deterministic checksums are compared.
7. The migration is marked complete only on exact match.
8. Firestore becomes the source of truth.
9. localStorage is refreshed as cache and offline fallback.
10. Subsequent edits are synchronized to Firestore using differential writes.

## Firestore collections
- `broadcasterCommissions`
- `broadcasterAliases`
- `importBatches`
- `lockedMonths`
- `appSettings/current`
- `migrations/broadcaster_v44`

## Validation
- cloud-bridge.js passed Node syntax validation.
- dashboard inline JavaScript blocks passed Node syntax validation: 2.
- Existing owner-only Firestore rules cover all required collections.
- No data file or backup file was modified.

## Rollback
The previous local dataset remains available in:
- the automatic local snapshot,
- localStorage cache,
- historical-data.json,
- the full v43 package.

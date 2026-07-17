# V45.3 Unified Approval Card Report

## Scope
Presentation-only unification of the pending-approval shortcut.

## Result
- Special wide purple card removed.
- Replaced with a normal `.card` inside `owner-card-grid-v45`.
- Purple is limited to the title and value.
- The card is inserted immediately before the full-width total-profit card.
- Existing click route remains `cloudSales`.

## Validation
- JavaScript blocks checked: 2
- Protected files unchanged: 7
- Firestore logic unchanged.

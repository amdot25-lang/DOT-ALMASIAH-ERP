# V45.4 Layout Fix Report

## Fixed issues
1. Monthly-target cards were right-aligned instead of visually centered.
2. Pending-approval card created an empty grid cell because the card count was odd.

## Result
- Monthly cards now use flex centering.
- Pending approval spans both grid columns.
- Total profit remains full width.
- No business logic changed.

## Validation
- JavaScript blocks checked: 2
- Protected files unchanged: 7

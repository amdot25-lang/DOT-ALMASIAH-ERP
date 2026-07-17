# V45.7 Supervisor Date Fix Report

## Root cause
`Date.prototype.toISOString()` uses UTC. Saudi Arabia is UTC+3, so between 00:00 and 02:59 local time the UTC date can still be the previous day.

## Resolution
A local `YYYY-MM-DD` helper is now used by the supervisor dashboard, filters, sale form and order number.

## Validation
- JavaScript blocks checked: 2
- Protected files unchanged: 7
- Owner v45.6 layout preserved.

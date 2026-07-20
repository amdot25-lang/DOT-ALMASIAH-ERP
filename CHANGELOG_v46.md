# v46 — Owner-only supervisor creation

- Removed public supervisor sign-up from the login page.
- Added supervisor account creation inside the owner-only Users & Permissions page.
- New supervisor profiles are created as pending and require owner activation.
- Prevented unknown authenticated accounts from auto-creating supervisor profiles.
- Hardened Firestore user-profile creation so only the owner can create profiles.
- Preserved all existing content, layouts, reports, and workflows.

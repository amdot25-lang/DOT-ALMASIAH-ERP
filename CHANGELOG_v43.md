# v43 — Internal Refactor

- Removed unreachable duplicate declarations of `renderDashboard` and `renderBroadcasters`.
- Removed superseded implementations of `v20BuildSuggestions` and `v20PrimaryName`.
- Preserved the active v20.2 implementation and `v20SuggestionMetrics`.
- Preserved every later dashboard and broadcaster wrapper/enhancer.
- No UI, data, Firebase, Firestore, authentication, or historical files were changed.
- Broadcaster migration and legacy dashboard modernization remain deferred.

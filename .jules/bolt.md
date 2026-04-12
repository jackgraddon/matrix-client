## 2026-04-12 - [O(N x M) DM Partner Lookup]
**Learning:** In Matrix apps with many DMs, looking up a DM partner's userId by searching the entire 'm.direct' account data for every room in the sidebar creates a significant (N \times M)$ bottleneck during re-renders.
**Action:** Always pre-calculate a flat 'roomId -> userId' hash map in the store whenever the 'm.direct' account data is updated to ensure (1)$ lookups in UI components.

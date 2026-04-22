## 2025-05-22 - [Sidebar DM List Optimization]
**Learning:** In `ChatSidebar.vue`, the DM list was performing an $O(N \times M)$ lookup for partner user IDs by iterating over the entire `m.direct` account data for every room. Additionally, `room.getJoinedMembers()` was used for member count checks, which is expensive as it allocates a new array and instantiates member objects.
**Action:** Use a pre-calculated `Map<roomId, userId>` for $O(1)$ partner lookups and prefer `room.getJoinedMemberCount()` for member count checks to avoid unnecessary allocations.

## 2026-04-22 - [Chat Message List Reactivity & Computation Optimization]
**Learning:** `Chat.vue` was experiencing performance degradation with large message lists due to `messages` being a deep `ref` and expensive operations (regex URL extraction, date formatting) being performed in the template or re-calculated for the entire list on every update. Standard `computed` properties that map over the entire list also contributed to overhead.
**Action:** Use `shallowRef` for large data lists like `messages` to skip recursive reactivity. Pre-calculate metadata (formatted time, URL status, sender grouping) during the initial sync/mapping pass and store it directly on the message object. This reduces render-time overhead and prevents redundant $O(N)$ regex/formatting passes.

## 2025-05-22 - [Sidebar DM List Optimization]
**Learning:** In `ChatSidebar.vue`, the DM list was performing an $O(N \times M)$ lookup for partner user IDs by iterating over the entire `m.direct` account data for every room. Additionally, `room.getJoinedMembers()` was used for member count checks, which is expensive as it allocates a new array and instantiates member objects.
**Action:** Use a pre-calculated `Map<roomId, userId>` for $O(1)$ partner lookups and prefer `room.getJoinedMemberCount()` for member count checks to avoid unnecessary allocations.

## 2025-07-15 - [Chat Timeline Rendering Optimization]
**Learning:** In , URL extraction and UI metadata (sender grouping, time formatting) were being recalculated for the entire message list in a computed property every time a new message arrived. This caused (N)$ overhead per message update, leading to lag in large rooms.
**Action:** Use  for the  array and pre-calculate expensive metadata during the sync phase. Use full array replacements to trigger UI updates efficiently.

## 2025-07-15 - [Chat Timeline Rendering Optimization]
**Learning:** In `Chat.vue`, URL extraction and UI metadata (sender grouping, time formatting) were being recalculated for the entire message list in a computed property every time a new message arrived. This caused $O(N)$ overhead per message update, leading to lag in large rooms.
**Action:** Use `shallowRef` for the `messages` array and pre-calculate expensive metadata during the sync phase. Use full array replacements to trigger UI updates efficiently.

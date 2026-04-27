## 2025-05-22 - [Sidebar DM List Optimization]
**Learning:** In `ChatSidebar.vue`, the DM list was performing an $O(N \times M)$ lookup for partner user IDs by iterating over the entire `m.direct` account data for every room. Additionally, `room.getJoinedMembers()` was used for member count checks, which is expensive as it allocates a new array and instantiates member objects.
**Action:** Use a pre-calculated `Map<roomId, userId>` for $O(1)$ partner lookups and prefer `room.getJoinedMemberCount()` for member count checks to avoid unnecessary allocations.

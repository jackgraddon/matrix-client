## 2025-05-22 - [Sidebar DM List Optimization]
**Learning:** In `ChatSidebar.vue`, the DM list was performing an $O(N \times M)$ lookup for partner user IDs by iterating over the entire `m.direct` account data for every room. Additionally, `room.getJoinedMembers()` was used for member count checks, which is expensive as it allocates a new array and instantiates member objects.
**Action:** Use a pre-calculated `Map<roomId, userId>` for $O(1)$ partner lookups and prefer `room.getJoinedMemberCount()` for member count checks to avoid unnecessary allocations.

## 2025-05-23 - [Chat Timeline Performance Boost]
**Learning:** The chat timeline in `Chat.vue` suffered from multiple performance bottlenecks: a `displayMessages` computed property that performed a full array map and regex extraction on every change, an expensive computed property for `latestGameEventMap`, and redundant UI logic (formatting/grouping) executed during every render. Additionally, using a standard `ref` for the message array caused significant reactivity overhead for large histories.
**Action:** Switch the message array to a `shallowRef`. Move all expensive metadata calculations (URL extraction, time formatting, sender grouping) into a single-pass loop within `refreshMessagesFromWindow`. Replace expensive computed properties and template function calls with these pre-calculated fields.

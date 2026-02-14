<template>
    <div class="flex flex-col h-screen">
        <header class="h-16 flex items-center px-4 gap-2 justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
                <Icon name="solar:chat-round-dots-bold" class="h-5 w-5" />
                Matrix Chat
            </h2>
            <div class="flex items-center gap-2">
                <ColorModeToggle />
            </div>
        </header>
        <UiResizablePanelGroup class="flex-1" direction="horizontal">
            <!-- Sidebar -->
            <UiResizablePanel :min-size="10" :default-size="15" :max-size="30">
                <aside class="flex h-full flex-col">
                    <nav class="grow flex-1 p-2 space-y-1 overflow-y-auto">
                        <UiButton
                            v-for="link in links"
                            :key="link.name"
                            :disabled="isLinkActive(link.to)"
                            :variant="isLinkActive(link.to) ? 'secondary' : 'ghost'"
                            class="w-full justify-start gap-2"
                            as-child
                        >
                            <NuxtLink :to="link.to">
                                <Icon
                                    :name="isLinkActive(link.to) ? `${link.icon}-bold` : `${link.icon}-linear`"
                                    class="h-4 w-4"
                                />
                                <!-- {{ link.name }} -->
                            </NuxtLink>
                        </UiButton>
                    </nav>
                    <footer class="p-2">
                        <UiButton variant="ghost" as-child>
                            <NuxtLink class="p-4 h-fit w-full flex justify-start" to="/chat/settings">
                                <UserProfile />
                            </NuxtLink>
                        </UiButton>
                    </footer>
                </aside>
            </UiResizablePanel>
            <UiResizableHandle with-handle class="bg-transparent" />
            <!-- Main Content -->
            <UiResizablePanel :min-size="70" :default-size="85" :max-size="90">
            <main class="flex h-full max-w-full flex-col">
                <div class="overflow-auto mb-2 mr-2 p-5 rounded-lg h-full bg-neutral-100 dark:bg-neutral-900">
                    <NuxtPage />
                </div>
            </main>
            </UiResizablePanel>
        </UiResizablePanelGroup>
    </div>
</template>

<script setup lang="ts">
definePageMeta({
    middleware: "auth",
});

const route = useRoute();

const links = [
    { name: "Home", to: "/chat", icon: "solar:home-angle" },
    { name: "People", to: "/chat/people", icon: "solar:users-group-rounded" },
    // { name: "Rooms", to: "/chat/rooms", icon: "solar:hashtag" },
];

// Get rooms from matrix
const rooms = ref([] as any[]);

onMounted(async () => {
    // const store = useMatrixStore();
    // rooms.value = await store.client!.getVisibleRooms();
    // console.log(rooms.value);
});

const isLinkActive = (to: string) => {
    if (to === "/chat") return route.path === "/chat";
    return route.path.startsWith(to);
};
</script>

<template>
    <div class="h-screen">
        <UiResizablePanelGroup direction="horizontal">
            <!-- Sidebar -->
            <UiResizablePanel :min-size="12" :default-size="15" :max-size="30">
                <aside class="flex flex-col h-full">
                    <div class="h-16 p-4">
                        <h2 class="text-lg font-semibold flex items-center gap-2">
                        <Icon name="solar:chat-round-dots-bold" class="h-5 w-5" />
                        Matrix Chat
                        </h2>
                    </div>
                    <nav class="grow flex-1 p-2 space-y-1 overflow-y-auto">
                        <UiButton variant="ghost" class="w-full justify-start gap-2" as-child>
                            <NuxtLink to="/chat">
                                <Icon name="solar:home-angle-bold" class="h-4 w-4" />
                                Home
                            </NuxtLink>
                        </UiButton>
                        <UiButton variant="ghost" class="w-full justify-start gap-2" as-child>
                            <NuxtLink to="/chat/people">
                                <Icon name="solar:users-group-rounded-bold" class="h-4 w-4" />
                                People
                            </NuxtLink>
                        </UiButton>
                        <UiButton variant="ghost" class="w-full justify-start gap-2" as-child>
                            <NuxtLink to="/chat/rooms">
                                <Icon name="solar:hashtag-bold" class="h-4 w-4" />
                                Rooms
                            </NuxtLink>
                        </UiButton>
                    </nav>

                    <footer class="p-4 border-t">
                        <UserProfile />
                    </footer>
                </aside>
            </UiResizablePanel>
            <UiResizableHandle />
            <!-- Main Content -->
            <UiResizablePanel :min-size="68" :default-size="85" :max-size="90">
            <main class="flex-1 flex flex-col overflow-hidden">
                <header class="h-16 border-b flex items-center px-4 justify-between">
                    <h1 class="font-medium">Welcome</h1>
                    <div class="flex items-center gap-2">
                        <!-- Header actions (search, theme toggle, etc) -->
                    </div>
                </header>
                <div class="flex-1 overflow-auto p-0">
                    <!-- Render nested routes here -->
                    <NuxtPage />
                </div>
            </main>
            </UiResizablePanel>
        </UiResizablePanelGroup>
    </div>
</template>

<script setup lang="ts">
definePageMeta({
    middleware: "auth"
});
</script>

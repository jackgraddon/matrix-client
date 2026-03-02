<script setup lang="ts">
import type { MatrixEvent } from 'matrix-js-sdk';

const props = defineProps<{
  event: MatrixEvent;
}>();

const store = useMatrixStore();
const content = computed(() => props.event.getContent());
const isMyInvite = computed(() => content.value.invited_user === store.client?.getUserId());
const isOwnInvite = computed(() => props.event.getSender() === store.client?.getUserId());

async function acceptInvite() {
  const roomId = props.event.getRoomId()!;
  const gameId = content.value.game_id;
  const gameType = content.value.game_type;

  const initialBoard = Array(9).fill(null);
  const players = {
    X: props.event.getSender()!,
    O: store.client?.getUserId()!
  };

  await store.client?.sendStateEvent(roomId, 'cc.jackg.ruby.game.state', {
    game_id: gameId,
    game_type: gameType,
    status: 'active',
    players: players,
    board: initialBoard,
    current_turn: players.X,
    started_at: Date.now()
  }, gameId);

  await store.client?.sendEvent(roomId, 'cc.jackg.ruby.game.action', {
    game_id: gameId,
    action: 'accept',
    player: store.client?.getUserId()
  });
}
</script>

<template>
  <div class="flex flex-col gap-3 p-4 bg-muted/20 border border-border rounded-xl shadow-sm max-w-[320px]">
    <div class="flex items-center gap-2">
      <div class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon name="solar:gamepad-bold" class="h-5 w-5 text-primary" />
      </div>
      <div class="flex flex-col">
        <span class="text-sm font-bold">Game Invite</span>
        <span class="text-xs text-muted-foreground">{{ content.game_type }}</span>
      </div>
    </div>

    <p class="text-xs text-muted-foreground leading-relaxed">
      {{ content.body }}
    </p>

    <div v-if="isMyInvite" class="mt-2 flex gap-2">
      <UiButton size="sm" class="flex-1 rounded-full text-xs font-semibold" @click="acceptInvite">
        Accept
      </UiButton>
      <UiButton size="sm" variant="outline" class="flex-1 rounded-full text-xs font-semibold">
        Decline
      </UiButton>
    </div>
    <div v-else-if="isOwnInvite" class="mt-2 flex items-center justify-center py-1 bg-primary/5 rounded-full border border-primary/10">
      <span class="text-[10px] font-medium text-primary">Waiting for opponent...</span>
    </div>
  </div>
</template>

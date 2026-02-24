<template>
  <div class="flex flex-col w-[400px] p-2 rounded-lg bg-neutral-500 border-1 border-neutral-400">
    <div class="">
      <UserProfile
        :user="user"
        size="full"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>

const props = defineProps<{
  userid: string;
}>();

const store = useMatrixStore();

const user = computed(() => store.client?.getUser(props.userid));

console.log(user);
</script>

<style>

</style>
export const useJellyfin = () => {
  const { $jellyfin } = useNuxtApp();

  return {
    fetcher: $jellyfin,
  };
};

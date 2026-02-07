export default defineNuxtRouteMiddleware((to, from) => {
    // With SSR disabled for /chat/** routes, this middleware only runs on client.
    // However, keeping the safety check just in case it's used elsewhere.
    if (import.meta.server) return;

    const matrixStore = useMatrixStore();

    // Check store first
    if (matrixStore.isAuthenticated) {
        return;
    }

    // Fallback: Check localStorage directly. 
    // Since we are client-side only for these routes, we can trust localStorage existence.
    const token = localStorage.getItem("matrix_access_token");
    if (token) {
        return; // Allow navigation, store will catch up
    }

    return navigateTo('/login');
})

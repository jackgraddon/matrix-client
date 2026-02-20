
export default defineNuxtRouteMiddleware((to, from) => {
    // We can check localStorage directly for speed, 
    // or use the store state if it's already hydrated.
    const hasToken = import.meta.client && localStorage.getItem('matrix_access_token');

    if (!hasToken && to.path.startsWith('/chat')) {
        return navigateTo('/login');
    }
});
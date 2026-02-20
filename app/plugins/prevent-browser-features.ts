export default defineNuxtPlugin(() => {
    if (typeof window === 'undefined') return;

    // Disable Backspace Navigation
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Backspace') {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            if (!isInput) e.preventDefault();
        }
    });

    // Disable the default Right-Click Menu
    window.addEventListener('contextmenu', (e: MouseEvent) => {
        if (process.env.NODE_ENV === 'production') {
            e.preventDefault();
        }
    });

    // Disable "Ghost Dragging" of images and links
    window.addEventListener('dragstart', (e: DragEvent) => {
        const target = e.target as HTMLElement;
        if (target.getAttribute('draggable') !== 'true') {
            e.preventDefault();
        }
    });

    // Disable Wheel Zooming (Ctrl + Scroll / Cmd + Scroll)
    window.addEventListener('wheel', (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
        }
    }, { passive: false });
});
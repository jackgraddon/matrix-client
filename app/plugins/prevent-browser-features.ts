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

    // Disable native browser "Ghost Dragging" of images and links,
    // but allow vuedraggable/SortableJS drag operations to proceed.
    window.addEventListener('dragstart', (e: DragEvent) => {
        const target = e.target as HTMLElement;
        const tag = target.tagName;
        // Only block the default drag behavior for images and links
        // that are NOT inside a sortable/draggable container
        if ((tag === 'IMG' || tag === 'A') && !target.closest('[draggable="true"]')) {
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
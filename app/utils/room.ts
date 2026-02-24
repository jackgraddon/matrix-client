import type { Room } from 'matrix-js-sdk';

/**
 * Identifies if a room is an Element-style voice/video room or a modern MatrixRTC call room.
 */
export function isVoiceChannel(room: Room | null | undefined): boolean {
    if (!room) return false;

    // 1. Check for modern MatrixRTC Call Rooms (type: 'org.matrix.msc3401.call')
    if (typeof room.isCallRoom === 'function' && room.isCallRoom()) {
        return true;
    }

    // 2. Check for legacy Element Video Rooms (type: 'io.element.video')
    if (typeof (room as any).isElementVideoRoom === 'function' && (room as any).isElementVideoRoom()) {
        return true;
    }

    // 3. Fallback manual check of the room type in m.room.create
    const createEvent = room.currentState.getStateEvents('m.room.create', '');
    const type = createEvent?.getContent()?.type;

    return type === 'io.element.video' || type === 'org.matrix.msc3401.call';
}

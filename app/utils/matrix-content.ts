/**
 * Helper to extract a readable summary of the message.
 * Mirror of public/sw.js — keep in sync.
 */
export function getMessageSummary(content: any): string {
    if (!content) return 'New message';

    // Handle encrypted messages (Matrix doesn't send content for these usually in push)
    if (content.msgtype === undefined && content.algorithm) {
        return 'New encrypted message';
    }

    // Custom game state events
    if (content.game_id) {
        if (content.type === 'cc.jackg.ruby.game.action' || content.msgtype === 'cc.jackg.ruby.game.action' || content.action) {
            const action = content.action;
            if (action === 'move') {
                if (content.move) {
                    const pieceMap: Record<string, string> = {
                        'p': 'Pawn', 'r': 'Rook', 'n': 'Knight', 'b': 'Bishop', 'q': 'Queen', 'k': 'King'
                    };
                    const pieceName = pieceMap[content.piece] || 'Piece';
                    const to = content.to ? content.to.toUpperCase() : content.move;
                    if (content.piece && content.to) {
                        return `moved ${pieceName} to ${to}`;
                    }
                    return `moved ${content.move}`;
                }
                if (typeof content.position === 'number') {
                    return `moved at position ${content.position + 1}`;
                }
                return 'made a move';
            }
            if (action === 'accept') return 'accepted the game!';
            if (action === 'decline') return 'declined the game.';
            if (action === 'play') {
                const words = content.words || [];
                const wordText = words.length > 0 ? ` '${words.join(', ')}'` : '';
                const score = content.score || 0;
                return `played${wordText} for ${score} points`;
            }
            if (action === 'swap') {
                return `swapped ${content.count || 'some'} tiles`;
            }
            if (action === 'pass') {
                return 'passed their turn';
            }
            if (action === 'challenge') {
                return 'challenged the last move!';
            }
            if (action === 'resolve_challenge') {
                const result = content.result === 'accepted' ? 'ACCEPTED' : 'REJECTED';
                return `resolved the challenge: Move was ${result}`;
            }
            if (content.type === 'revert' || content.msgtype === 'revert' || action === 'revert') {
                const words = content.words ? content.words.filter((w: string) => w !== 'BINGO!').join(', ') : '';
                return `reverted the illegal move ('${words}')`;
            }
            return `action: ${action}`;
        }

        if (content.type === 'cc.jackg.ruby.game.state' || content.msgtype === 'cc.jackg.ruby.game.state') return 'Game state updated';

        return 'Game update';
    }

    switch (content.msgtype) {
        case 'm.text':
        case 'm.notice':
        case 'm.emote':
            return content.body;
        case 'm.image':
            return 'Sent an image';
        case 'm.video':
            return 'Sent a video';
        case 'm.audio':
            return 'Sent an audio file';
        case 'm.file':
            return `Sent a file: ${content.body}`;
        case 'm.location':
            return 'Shared a location';
        default:
            return content.body || 'New message';
    }
}

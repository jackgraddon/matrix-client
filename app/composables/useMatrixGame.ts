import { useMatrixStore } from '~/stores/matrix'

export function useMatrixGame(roomId: string) {
  const store = useMatrixStore()
  const matrixClient = store.client

  // Send a game invite into the timeline
  async function inviteToGame(gameType: string, opponentId: string) {
    if (!matrixClient) return
    const gameId = `game_${crypto.randomUUID()}`
    await matrixClient.sendEvent(roomId, 'm.room.message', {
      msgtype: 'cc.jackg.ruby.game.invite',
      body: `Game invite: ${gameType}`,
      game_type: gameType,
      game_id: gameId,
      invited_user: opponentId,
    })
    return gameId
  }

  // Persist board state as a Matrix timeline event (using timeline instead of state to avoid 403s)
  async function updateGameState(gameId: string, stateContent: object) {
    if (!matrixClient) return
    await matrixClient.sendEvent(roomId, 'cc.jackg.ruby.game.state', {
      game_id: gameId,
      ...stateContent,
    })
  }

  // Send an action (move, forfeit, etc.) to the timeline
  async function sendGameAction(gameId: string, action: object) {
    if (!matrixClient) return
    await matrixClient.sendEvent(roomId, 'cc.jackg.ruby.game.action', {
      game_id: gameId,
      ...action,
    })
  }

  // Read current game state from the timeline (most recent state event for this gameId)
  function getGameState(gameId: string) {
    if (!matrixClient) return null
    const room = matrixClient.getRoom(roomId)
    if (!room) return null

    // Search live timeline backwards for the latest state event
    const events = room.getLiveTimeline().getEvents()
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev.getType() === 'cc.jackg.ruby.game.state' && ev.getContent().game_id === gameId) {
        return ev.getContent()
      }
    }
    return null
  }

  return { inviteToGame, updateGameState, sendGameAction, getGameState }
}

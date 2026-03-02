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

  // Persist board state as a Matrix state event
  async function updateGameState(gameId: string, stateContent: object) {
    if (!matrixClient) return
    await matrixClient.sendStateEvent(
      roomId,
      'cc.jackg.ruby.game.state',
      stateContent,
      gameId // state_key = gameId, allows multiple concurrent games
    )
  }

  // Send an action (move, forfeit, etc.) to the timeline
  async function sendGameAction(gameId: string, action: object) {
    if (!matrixClient) return
    await matrixClient.sendEvent(roomId, 'cc.jackg.ruby.game.action', {
      game_id: gameId,
      ...action,
    })
  }

  // Read current game state from room state
  function getGameState(gameId: string) {
    if (!matrixClient) return null
    const room = matrixClient.getRoom(roomId)
    return room?.currentState
      .getStateEvents('cc.jackg.ruby.game.state', gameId)
      ?.getContent()
  }

  return { inviteToGame, updateGameState, sendGameAction, getGameState }
}

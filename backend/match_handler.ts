const moduleName = "tic-tac-toe_js";
const tickRate = 5;
const maxEmptySec = 30;
const delaybetweenGamesSec = 5;
const turnTimeTimedSec = 30; // 30 seconds for timed mode

const winningPositions: number[][] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
]

interface MatchLabel {
    open: number
    timed: number  // 1 = timed mode (with timer), 0 = normal mode (no timer)
}

interface State {
    // Match label
    label: MatchLabel
    // Ticks where no actions have occurred.
    emptyTicks: number
    // Currently connected users, or reserved spaces.
    presences: {[userId: string]: nkruntime.Presence | null}
    // Number of users currently in the process of connecting to the match.
    joinsInProgress: number
    // True if there's a game currently in progress.
    playing: boolean
    // Current state of the board.
    board: Board
    // Mark assignments to player user IDs.
    marks: {[userId: string]: Mark | null}
    // Whose turn it currently is.
    mark: Mark
    // Ticks until they must submit their move.
    deadlineRemainingTicks: number
    // The winner of the current game.
    winner: Mark | null
    // The winner positions.
    winnerPositions: BoardPosition[] | null
    // Ticks until the next game starts, if applicable.
    nextGameRemainingTicks: number
}

let matchInit: nkruntime.MatchInitFunction<State> = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, params: {[key: string]: string}) {
    const timed = params['timed'] === 'true' || params['timed'] === '1';
    let label: MatchLabel = {
        open: 1,
        timed: timed ? 1 : 0,
    }

    let state: State = {
        label: label,
        emptyTicks: 0,
        presences: {},
        joinsInProgress: 0,
        playing: false,
        board: [],
        marks: {},
        mark: Mark.UNDEFINED,
        deadlineRemainingTicks: 0,
        winner: null,
        winnerPositions: null,
        nextGameRemainingTicks: 0,
    }

    logger.debug('Match init: tickRate: %d, timed: %t', tickRate, timed);

    return {
        state,
        tickRate,
        label: JSON.stringify(label),
    }
}

let matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<State> = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, presence: nkruntime.Presence, metadata: {[key: string]: any}) {
    // Check if it's a user attempting to rejoin after a disconnect.
    if (presence.userId in state.presences) {
        if (state.presences[presence.userId] === null) {
            // User rejoining after a disconnect.
            state.joinsInProgress++;
            return {
                state: state,
                accept: false,
            }
        } else {
            // User attempting to join from 2 different devices at the same time.
            return {
                state: state,
                accept: false,
                rejectMessage: 'already joined',
            }
        }
    }

    // Check if match is full.
    if (connectedPlayers(state) + state.joinsInProgress >= 2) {
        return {
            state: state,
            accept: false,
            rejectMessage: 'match full',
        };
    }

    // New player attempting to connect.
    state.joinsInProgress++;
    try {
        logger.info('Match %s joinAttempt: user=%s connected=%d joinsInProgress=%d', ctx.matchId, presence.userId, connectedPlayers(state), state.joinsInProgress);
    } catch (e) {
        // ignore logging failures
    }
    return {
        state,
        accept: true,
    }
}

let matchJoin: nkruntime.MatchJoinFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, presences: nkruntime.Presence[]) {
    const t = msecToSec(Date.now());

    for (const presence of presences) {
        state.emptyTicks = 0;
        state.presences[presence.userId] = presence;
        state.joinsInProgress--;

        // Check if we must send a message to this user to update them on the current game state.
        if (state.playing) {
            // There's a game still currently in progress, the player is re-joining after a disconnect. Give them a state update.
            let update: UpdateMessage = {
                board: state.board,
                mark: state.mark,
                deadline: t + Math.floor(state.deadlineRemainingTicks/tickRate),
            }
            // Send a message to the user that just joined.
            dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify(update));
        } else if (state.board.length !== 0 && Object.keys(state.marks).length !== 0 && state.marks[presence.userId]) {
            logger.debug('player %s rejoined game', presence.userId);
            // There's no game in progress but we still have a completed game that the user was part of.
            // They likely disconnected before the game ended, and have since forfeited because they took too long to return.
            let done: DoneMessage = {
                board: state.board,
                winner: state.winner,
                winnerPositions: state.winnerPositions,
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks/tickRate)
            }
            // Send a message to the user that just joined.
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(done))
        }
    }

    // Log presences and counters after processing joins to aid debugging of START race
    try {
        logger.info('Match %s after join: presences=%o, connected=%d, joinsInProgress=%d', ctx.matchId, Object.keys(state.presences), connectedPlayers(state), state.joinsInProgress);
    } catch (e) {
        // ignore logging failures
    }

    // If we've now reached 2 connected players and a game is not already playing,
    // start the game immediately here so clients that subscribed before join
    // don't miss the START message while waiting for the next matchLoop tick.
    if (!state.playing && connectedPlayers(state) >= 2) {
        state.playing = true;
        state.board = [null,null,null,null,null,null,null,null,null];
        state.marks = {};
        let marks = [Mark.X, Mark.O];
        Object.keys(state.presences).forEach(userId => {
            if (state.presences[userId] !== null) {
                state.marks[userId] = marks.shift() ?? null;
            }
        });
        logger.info('Match %s (join-start): starting game; presences=%o marks=%o', ctx.matchId, Object.keys(state.presences), state.marks);
        state.mark = Mark.X;
        state.winner = Mark.UNDEFINED;
        state.winnerPositions = null;
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        state.nextGameRemainingTicks = 0;

        let msg: StartMessage = {
            board: state.board,
            marks: state.marks,
            mark: state.mark,
            deadline: msecToSec(Date.now()) + Math.floor(state.deadlineRemainingTicks / tickRate),
        }
        logger.info('Broadcasting START message for match %s (join-start): %o', ctx.matchId, msg);
        dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg));
        logger.info('START message dispatched for match %s (join-start)', ctx.matchId);
    }

    // Check if match was open to new players, but should now be closed.
    if (Object.keys(state.presences).length >= 2 && state.label.open != 0) {
        state.label.open = 0;
        const labelJSON = JSON.stringify(state.label);
        dispatcher.matchLabelUpdate(labelJSON);
    }
    

    return {state};
}

let matchLeave: nkruntime.MatchLeaveFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, presences: nkruntime.Presence[]) {
    for (let presence of presences) {
        logger.info("Player: %s left match: %s.", presence.userId, ctx.matchId);
        state.presences[presence.userId] = null;
    }

    let humanPlayersRemaining: nkruntime.Presence[] = [];
    Object.keys(state.presences).forEach((userId) => {
        if (state.presences[userId] !== null) {
            humanPlayersRemaining.push(state.presences[userId]!);
        }
    });

    // If a game is in progress and opponent left, the remaining player wins
    if (state.playing && humanPlayersRemaining.length === 1) {
        state.playing = false;
        
        // Find the winner (remaining player)
        const remainingUserId = humanPlayersRemaining[0].userId;
        const winnerMark = state.marks[remainingUserId] || null;
        state.winner = winnerMark;
        state.winnerPositions = null;
        state.deadlineRemainingTicks = 0;
        
        // Record game result - winner by opponent leaving
        const playerIds = Object.keys(state.presences).filter(id => state.presences[id] !== null || id === presences[0].userId);
        logger.info('Recording game result (opponent left): matchId=%s, winner=%s, playerIds=%o', 
            ctx.matchId, remainingUserId, playerIds);
        recordGameResult(nk, logger, remainingUserId, playerIds, false, ctx.matchId);
        
        const t = msecToSec(Date.now());
        let msg: DoneMessage = {
            board: state.board,
            winner: state.winner,
            winnerPositions: null,
            nextGameStart: 0, // No auto-start
        }
        
        // Send DONE message to remaining player
        dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(msg), humanPlayersRemaining);
        
        // Also send OPPONENT_LEFT for UI handling
        dispatcher.broadcastMessage(OpCode.OPPONENT_LEFT, null, humanPlayersRemaining, null, true);
    } else if (humanPlayersRemaining.length === 1) {
        // Game not in progress, just notify
        dispatcher.broadcastMessage(OpCode.OPPONENT_LEFT, null, humanPlayersRemaining, null, true);
    }

    if (humanPlayersRemaining.length === 0) {
        logger.info('All players left match %s. Terminating match.', ctx.matchId);
    } else {
        logger.info('Match %s terminating after player leave. Remaining players: %d', ctx.matchId, humanPlayersRemaining.length);
    }
    return null;
}

let matchLoop: nkruntime.MatchLoopFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, messages: nkruntime.MatchMessage[]) {
    logger.debug('Running match loop. Tick: %d', tick);
    
    // Add more observability to understand why START/UPDATE/DONE may not be sent.
    try {
        logger.debug('Match %s loop: playing=%t, presences=%d, joinsInProgress=%d, emptyTicks=%d, nextGameRemainingTicks=%d', ctx.matchId, state.playing, Object.keys(state.presences).length, state.joinsInProgress, state.emptyTicks, state.nextGameRemainingTicks);
    } catch (e) {
        // ignore logging failures
    }
    if (connectedPlayers(state) + state.joinsInProgress === 0) {
        state.emptyTicks++;
        if (state.emptyTicks >= maxEmptySec * tickRate) {
            // Match has been empty for too long, close it.
            logger.info('closing idle match');
            return null;
        }
    }

    let t = msecToSec(Date.now());

    // If there's no game in progress check if we can (and should) start one!
    if (!state.playing) {
        // Between games any disconnected users are purged, there's no in-progress game for them to return to anyway.
        for (let userID in state.presences) {
            if (state.presences[userID] === null) {
                delete state.presences[userID];
            }
        }

        // Check if we need to update the label so the match now advertises itself as open to join.
        if (Object.keys(state.presences).length < 2 && state.label.open != 1) {
            state.label.open = 1;
            let labelJSON = JSON.stringify(state.label);
            dispatcher.matchLabelUpdate(labelJSON);
        }

        // Don't auto-start new games. Let clients explicitly request a new game.
        // Only start if this is the initial game when 2 players join
        const connectedCount = Object.keys(state.presences).length;
        if (connectedCount < 2) {
            logger.debug('Match %s: not enough players to start (have=%d)', ctx.matchId, connectedCount);
            return { state };
        }

        // Only start a new game if board is empty (first game) and we haven't started yet
        // This prevents auto-starting after a game ends
        if (state.board.length === 0 && !state.playing && state.winner === null) {
            // First game - start it
            state.playing = true;
            state.board = [null,null,null,null,null,null,null,null,null];
            state.marks = {};
            let marks = [Mark.X, Mark.O];
            Object.keys(state.presences).forEach(userId => {
                if (state.presences[userId] !== null) {
                    state.marks[userId] = marks.shift() ?? null;
                }
            });
            logger.info('Match %s: starting first game; presences=%o marks=%o', ctx.matchId, Object.keys(state.presences), state.marks);
            state.mark = Mark.X;
            state.winner = Mark.UNDEFINED;
            state.winnerPositions = null;
            state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
            state.nextGameRemainingTicks = 0;

            // Notify the players a new game has started.
            let msg: StartMessage = {
                board: state.board,
                marks: state.marks,
                mark: state.mark,
                deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
            }
            logger.info('Broadcasting START message for match %s: %o', ctx.matchId, msg);
            dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg));
            logger.info('START message dispatched for match %s', ctx.matchId);
        }

        return { state };
    }

    // There's a game in progress. Check for input, update match state, and send messages to clientstate.
    for (const message of messages) {
        switch (message.opCode) {
            case OpCode.MOVE:
                let mark = state.marks[message.sender.userId] ?? null;
                logger.debug('Received move message from user: %s (mark: %s)', message.sender.userId, mark === Mark.X ? 'X' : 'O');
                let sender = [message.sender];
                if (mark === null || state.mark != mark) {
                    // It is not this player's turn.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, sender);
                    continue;
                }

                let msg = {} as MoveMessage;
                try {
                    msg = JSON.parse(nk.binaryToString(message.data));
                } catch (error) {
                    // Client sent bad data.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, sender);
                    logger.debug('Bad data received: %v', error);
                    continue;
                }
                if (state.board[msg.position]) {
                    // Client sent a position outside the board, or one that has already been played.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, sender);
                    continue;
                }

                // Update the game state.
                state.board[msg.position] = mark;
                state.mark = mark === Mark.O ? Mark.X : Mark.O;
                state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);

                // Check if game is over through a winning move.
                const [winner, winningPos] = winCheck(state.board, mark);
                if (winner) {
                    state.winner = mark;
                    state.winnerPositions = winningPos;
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = 0; // No auto-start
                    
                    // Record game result - winner
                    const playerIds = Object.keys(state.presences).filter(id => state.presences[id] !== null);
                    let winnerUserId: string | null = null;
                    for (const userId in state.marks) {
                        if (state.marks[userId] === mark) {
                            winnerUserId = userId;
                            break;
                        }
                    }
                    logger.info('Recording game result: matchId=%s, winner=%s, playerIds=%o', 
                        ctx.matchId, winnerUserId, playerIds);
                    recordGameResult(nk, logger, winnerUserId, playerIds, false, ctx.matchId);
                }
                // Check if game is over because no more moves are possible.
                let tie = state.board.every(v => v !== null);
                if (tie && !state.winner) {
                    // Update state to reflect the tie
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = 0; // No auto-start
                    state.winner = null; // null means draw
                    
                    // Record game result - draw
                    const playerIds = Object.keys(state.presences).filter(id => state.presences[id] !== null);
                    logger.info('Recording game result: matchId=%s, draw=true, playerIds=%o', 
                        ctx.matchId, playerIds);
                    recordGameResult(nk, logger, null, playerIds, true, ctx.matchId);
                }

                let opCode: OpCode
                let outgoingMsg: Message
                if (state.playing) {
                    opCode = OpCode.UPDATE
                    let msg: UpdateMessage = {
                        board: state.board,
                        mark: state.mark,
                        deadline: t + Math.floor(state.deadlineRemainingTicks/tickRate),
                    }
                    outgoingMsg = msg;
                } else {
                    opCode = OpCode.DONE
                    let msg: DoneMessage = {
                        board: state.board,
                        winner: state.winner,
                        winnerPositions: state.winnerPositions,
                        nextGameStart: 0, // No auto-start
                    }
                    outgoingMsg = msg;
                }
                logger.debug('Broadcasting %d message: %o', opCode, outgoingMsg);
                dispatcher.broadcastMessage(opCode, JSON.stringify(outgoingMsg));
                if (opCode === OpCode.DONE) {
                    logger.info('Match %s finished. Terminating authoritative match.', ctx.matchId);
                    return null;
                }
                break;

            default:
                // No other opcodes are expected from the client, so automatically treat it as an error.
                dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                logger.error('Unexpected opcode received: %d', message.opCode);
        }
    }

    // Keep track of the time remaining for the player to submit their move.
    // Only enforce timer in timed mode. In normal mode, timer is effectively disabled.
    if (state.playing && state.label.timed === 1) {
        state.deadlineRemainingTicks--;
        if (state.deadlineRemainingTicks <= 0 ) {
            // In timed mode, timeout passes the turn instead of forfeiting the game
            // Switch turn to opponent
            state.mark = state.mark === Mark.O ? Mark.X : Mark.O;
            state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
            
            // Send update with turn change
            let update: UpdateMessage = {
                board: state.board,
                mark: state.mark,
                deadline: t + Math.floor(state.deadlineRemainingTicks/tickRate),
            }
            logger.debug('Broadcasting UPDATE (timeout - turn passed) message: %o', update);
            dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify(update));
        }
    } else if (state.playing && state.label.timed === 0) {
        // Normal mode: reset deadline to prevent any timeout (effectively no timer)
        if (state.deadlineRemainingTicks < 3600 * tickRate) {
            state.deadlineRemainingTicks = 3600 * tickRate;
        }
    }

    return { state };
}

let matchTerminate: nkruntime.MatchTerminateFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, graceSeconds: number) {
    return { state };
}

let matchSignal: nkruntime.MatchSignalFunction<State> = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State) {
    return { state };
}

function calculateDeadlineTicks(l: MatchLabel): number {
    // If timed mode, use 30 seconds per turn
    if (l.timed === 1) {
    return turnTimeTimedSec * tickRate; // 30 seconds for timed mode
    } else {
        // Normal mode: no timer, use a very long timeout (1 hour = 3600 seconds)
        return 3600 * tickRate;
    }
}

function winCheck(board: Board, mark: Mark): [boolean, BoardPosition[] | null] {
    for(let wp of winningPositions) {
        if (board[wp[0]] === mark &&
            board[wp[1]] === mark &&
            board[wp[2]] === mark) {
            return [true, wp as BoardPosition[]];
        }
    }

    return [false, null];
}

function connectedPlayers(s: State): number {
    let count = 0;
    for(const p of Object.keys(s.presences)) {
        if (s.presences[p] !== null) {
            count++;
        }
    }
    return count;
}

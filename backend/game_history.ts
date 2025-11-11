const historyCollection = 'game_history';

interface GameHistoryEntry {
    matchId: string;
    playerId: string;
    opponentId: string;
    result: 'win' | 'loss' | 'draw';
    timestamp: number;
    isDraw: boolean;
}

let rpcGameHistory: nkruntime.RpcFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!ctx.userId) {
        throw Error('No user ID in context');
    }

    try {
        // Read game history for the user
        const readRequest: nkruntime.StorageReadRequest = {
            collection: historyCollection,
            key: ctx.userId,
            userId: ctx.userId,
        };

        let objects: nkruntime.StorageObject[] = [];
        try {
            objects = nk.storageRead([readRequest]);
        } catch (error) {
            // No history found, return empty array
            logger.debug('No game history found for user: %v', error);
            return JSON.stringify({ history: [] });
        }

        // Extract history list from storage
        let history: GameHistoryEntry[] = [];
        if (objects.length > 0 && objects[0].value && objects[0].value.history) {
            history = objects[0].value.history as GameHistoryEntry[];
            // Sort by timestamp descending (newest first)
            history.sort((a, b) => b.timestamp - a.timestamp);
        }

        return JSON.stringify({ history: history });
    } catch (error) {
        logger.error('Error fetching game history: %v', error);
        return JSON.stringify({ history: [] });
    }
};


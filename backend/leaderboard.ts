const leaderboardId = 'global_leaderboard';
const statsCollection = 'player_stats';

interface PlayerStats {
    wins: number;
    losses: number;
    draws: number;
    winStreak: number;
    bestWinStreak: number;
    totalGames: number;
    lastGameTime: number;
}

function recordGameResult(nk: nkruntime.Nakama, logger: nkruntime.Logger, winnerId: string | null, playerIds: string[], isDraw: boolean, matchId?: string) {
    for (const playerId of playerIds) {
        try {
            // Read current stats
            const readRequest: nkruntime.StorageReadRequest = {
                collection: statsCollection,
                key: playerId,
                userId: playerId,
            };
            
            let objects: nkruntime.StorageObject[];
            try {
                objects = nk.storageRead([readRequest]);
            } catch (error) {
                logger.error('Error reading stats for user %s: %v', playerId, error);
                objects = [];
            }

            let stats: PlayerStats = {
                wins: 0,
                losses: 0,
                draws: 0,
                winStreak: 0,
                bestWinStreak: 0,
                totalGames: 0,
                lastGameTime: msecToSec(Date.now()),
            };

            if (objects.length > 0) {
                stats = objects[0].value as PlayerStats;
            }

            // Update stats based on game result
            stats.totalGames++;
            stats.lastGameTime = msecToSec(Date.now());

            if (isDraw) {
                stats.draws++;
                stats.winStreak = 0; // Reset streak on draw
            } else if (winnerId === playerId) {
                stats.wins++;
                stats.winStreak++;
                if (stats.winStreak > stats.bestWinStreak) {
                    stats.bestWinStreak = stats.winStreak;
                }
            } else {
                stats.losses++;
                stats.winStreak = 0; // Reset streak on loss
            }

            // Write updated stats
            const writeRequest: nkruntime.StorageWriteRequest = {
                collection: statsCollection,
                key: playerId,
                userId: playerId,
                value: stats,
                permissionRead: 2, // Public read
                permissionWrite: 0, // Only server can write
            };

            if (objects.length > 0) {
                writeRequest.version = objects[0].version;
            }

            nk.storageWrite([writeRequest]);

            // Leaderboard will be created automatically on first write
            // Or can be created via nakama.yml configuration

            // Update leaderboard (score = wins - losses for ranking)
            const score = stats.wins - stats.losses;
            try {
                // Ensure leaderboard exists - Nakama creates it automatically on first write
                // But we need to handle the case where it might not exist
                nk.leaderboardRecordWrite(leaderboardId, playerId, playerId, score, 0, {
                    wins: stats.wins,
                    losses: stats.losses,
                    draws: stats.draws,
                    winStreak: stats.winStreak,
                    bestWinStreak: stats.bestWinStreak,
                });
                logger.info('Successfully wrote to leaderboard for player %s: score=%d, wins=%d, losses=%d', 
                    playerId, score, stats.wins, stats.losses);
            } catch (writeError) {
                logger.error('Error writing to leaderboard for player %s: %v', playerId, writeError);
                // Don't throw - continue with history storage even if leaderboard fails
            }

            logger.debug('Updated stats for player %s: wins=%d, losses=%d, draws=%d, streak=%d', 
                playerId, stats.wins, stats.losses, stats.draws, stats.winStreak);
            
            // Store game history - append to user's history list
            if (matchId) {
                try {
                    // Find opponent ID
                    let opponentId = '';
                    for (let i = 0; i < playerIds.length; i++) {
                        if (playerIds[i] !== playerId) {
                            opponentId = playerIds[i];
                            break;
                        }
                    }
                    
                    // Read existing history
                    const historyReadRequest: nkruntime.StorageReadRequest = {
                        collection: 'game_history',
                        key: playerId,
                        userId: playerId,
                    };
                    
                    let historyObjects: nkruntime.StorageObject[] = [];
                    try {
                        historyObjects = nk.storageRead([historyReadRequest]);
                    } catch (error) {
                        // No existing history, start fresh
                        historyObjects = [];
                    }
                    
                    let historyList: any[] = [];
                    if (historyObjects.length > 0) {
                        historyList = historyObjects[0].value.history || [];
                    }
                    
                    // Add new game entry (keep last 100 games)
                    const newEntry = {
                        matchId: matchId,
                        playerId: playerId,
                        opponentId: opponentId,
                        result: winnerId === playerId ? 'win' : (isDraw ? 'draw' : 'loss'),
                        timestamp: msecToSec(Date.now()),
                        isDraw: isDraw,
                    };
                    
                    historyList.push(newEntry);
                    // Keep only last 100 games
                    if (historyList.length > 100) {
                        historyList = historyList.slice(-100);
                    }
                    
                    // Write updated history
                    const historyWriteRequest: nkruntime.StorageWriteRequest = {
                        collection: 'game_history',
                        key: playerId,
                        userId: playerId,
                        value: { history: historyList },
                        permissionRead: 1, // Owner read only
                        permissionWrite: 0,
                    };
                    
                    if (historyObjects.length > 0) {
                        historyWriteRequest.version = historyObjects[0].version;
                    }
                    
                    nk.storageWrite([historyWriteRequest]);
                    logger.info('Successfully stored game history for player %s: matchId=%s, result=%s', 
                        playerId, matchId, newEntry.result);
                } catch (historyError) {
                    logger.error('Error storing game history for player %s: %v', playerId, historyError);
                }
            } else {
                logger.warn('No matchId provided for game history storage for player %s', playerId);
            }
        } catch (error) {
            logger.error('Error recording game result for user %s: %v', playerId, error);
        }
    }
}

let rpcLeaderboard: nkruntime.RpcFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!ctx.userId) {
        throw Error('No user ID in context');
    }

    try {
        // Leaderboard will be created automatically on first write
        // Or can be created via nakama.yml configuration

        // Get top 100 players
        const limit = 100;
        const leaderboardRecords = nk.leaderboardRecordsList(leaderboardId, [], limit, '');

        const records = leaderboardRecords.records || [];
        const result = records.map(record => ({
            rank: record.rank,
            userId: record.ownerId,
            username: record.ownerId, // In production, fetch from user account
            score: record.score,
            wins: record.metadata?.wins || 0,
            losses: record.metadata?.losses || 0,
            draws: record.metadata?.draws || 0,
            winStreak: record.metadata?.winStreak || 0,
            bestWinStreak: record.metadata?.bestWinStreak || 0,
        }));

        return JSON.stringify({ leaderboard: result });
    } catch (error) {
        logger.error('Error fetching leaderboard: %v', error);
        // Return empty leaderboard instead of throwing
        return JSON.stringify({ leaderboard: [] });
    }
};

let rpcGetStats: nkruntime.RpcFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!ctx.userId) {
        throw Error('No user ID in context');
    }

    try {
        const readRequest: nkruntime.StorageReadRequest = {
            collection: statsCollection,
            key: ctx.userId,
            userId: ctx.userId,
        };

        let objects: nkruntime.StorageObject[];
        try {
            objects = nk.storageRead([readRequest]);
        } catch (error) {
            logger.error('Error reading stats: %v', error);
            objects = [];
        }

        let stats: PlayerStats = {
            wins: 0,
            losses: 0,
            draws: 0,
            winStreak: 0,
            bestWinStreak: 0,
            totalGames: 0,
            lastGameTime: 0,
        };

        if (objects.length > 0) {
            stats = objects[0].value as PlayerStats;
        }

        // Get rank from leaderboard
        let rank = 0;
        try {
            const recordsResult = nk.leaderboardRecordsList(leaderboardId, [ctx.userId], 1, '');
            const records = recordsResult.records || [];
            if (records.length > 0) {
                rank = records[0].rank;
            }
        } catch (error) {
            logger.debug('Could not fetch rank: %v', error);
        }

        return JSON.stringify({
            ...stats,
            rank: rank || null,
        });
    } catch (error) {
        logger.error('Error fetching stats: %v', error);
        throw error;
    }
};


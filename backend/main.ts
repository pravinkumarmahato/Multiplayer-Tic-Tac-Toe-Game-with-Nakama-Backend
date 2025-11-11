const rpcIdRewards = 'rewards_js';
const rpcIdFindMatch = 'find_match_js';
const rpcIdLeaderboard = 'leaderboard_js';
const rpcIdGetStats = 'get_stats_js';

function InitModule(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
    initializer.registerRpc(rpcIdRewards, rpcReward);

    initializer.registerRpc(rpcIdFindMatch, rpcFindMatch);
    
    initializer.registerRpc(rpcIdLeaderboard, rpcLeaderboard);
    
    initializer.registerRpc(rpcIdGetStats, rpcGetStats);
    
    initializer.registerRpc('game_history_js', rpcGameHistory);

    try {
        (initializer as any).registerEventSessionStart?.(eventSessionStart);
        (initializer as any).registerEventSessionEnd?.(eventSessionEnd);
    } catch (e) {
        logger.error('Failed to register session event handlers: %v', e);
    }

    initializer.registerMatch(moduleName, {
        matchInit,
        matchJoinAttempt,
        matchJoin,
        matchLeave,
        matchLoop,
        matchTerminate,
        matchSignal,
    });

    logger.info('JavaScript logic loaded.');
}

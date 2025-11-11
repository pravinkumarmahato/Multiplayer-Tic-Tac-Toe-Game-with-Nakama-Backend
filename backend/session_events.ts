const notificationCodeSingleDevice = 101;
const streamModeNotification = 0;

function eventSessionEnd(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, evt: nkruntime.Event) {
    const userId = (ctx as any).userId as string | undefined;
    if (!userId) {
        logger.error('context did not contain user ID.');
        return;
    }

    const now = Math.floor(Date.now() / 1000);

    const write: nkruntime.StorageWriteRequest = {
        collection: 'user_last_online',
        key: userId,
        permissionRead: 1,
        permissionWrite: 0,
        value: { last_online_time_unix: now },
        userId: userId,
    }

    try {
        nk.storageWrite([write]);
    } catch (err) {
        logger.error('storageWrite error: %v', err);
    }
}

function eventSessionStart(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, evt: nkruntime.Event) {
    const userId = (ctx as any).userId as string | undefined;
    if (!userId) {
        logger.error('context did not contain user ID.');
        return;
    }

    const sessionId = (ctx as any).sessionId as string | undefined || "";

    // Fetch all live presences for this user on their private notification stream.
    // Use any-casts for runtime calls to avoid mismatches with ambient typings.
    let presences: any[] = [];
    try {
        presences = (nk as any).streamUserList(streamModeNotification, userId) || [];
    } catch (err) {
        logger.error('nk.streamUserList error: %v', err);
        return;
    }

    const notifications: any[] = [{
        code: notificationCodeSingleDevice,
        content: { kicked_by: sessionId },
        persistent: false,
        senderId: userId,
        subject: 'Another device is active!',
        userId: userId,
    }];

    for (const presence of presences) {
        // Presence objects in the JS runtime typically expose userId and sessionId properties.
        const pSessionId = (presence as any).sessionId as string | undefined;
        const pUserId = (presence as any).userId as string | undefined;

        if (pUserId === userId && pSessionId === sessionId) {
            // Ignore current connection.
            continue;
        }

        try {
            (nk as any).notificationsSend(notifications);
        } catch (err) {
            logger.error('nk.notificationsSend error: %v', err);
        }

        if (pSessionId) {
            try {
                (nk as any).sessionDisconnect(pSessionId);
            } catch (err) {
                logger.error('nk.sessionDisconnect error: %v', err);
            }
        }
    }
}

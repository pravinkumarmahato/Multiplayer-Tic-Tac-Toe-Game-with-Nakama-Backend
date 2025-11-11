import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ensureSession,
  connectSocket,
  joinMatchWithToken,
  getCurrentMatchId,
  sendMove,
  getPendingMatchToken,
  setPendingMatchToken,
  subscribeToMatchUpdates,
  leaveMatch,
} from "../services/nakamaClient";

  type StateUpdater<T> = (value: T | ((prev: T) => T)) => void;

  const { useEffect, useState, useRef } = React as unknown as {
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[] | undefined): void;
    useState<T>(initial: T | (() => T)): [T, StateUpdater<T>];
    useRef<T>(initial: T): { current: T };
  };

interface Player {
  username: string;
  symbol: string;
}

interface GameState {
  board: string[];
  turn: string;
  winner: string;
  started: boolean;
  players: Record<string, Player>;
  deadline?: number;
  winnerPositions?: number[] | null;
  nextGameStart?: number;
  rejected?: boolean;
  opponentLeft?: boolean;
}

const TIMED_TURN_DURATION = 30;

export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ timed?: string }>();
  const isTimedMode = params.timed === "true";
  const [gameState, setGameState] = useState<GameState>({
    board: Array(9).fill(""),
    turn: "",
    winner: "",
    started: false,
    players: {},
  });
  const [connected, setConnected] = useState(false);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeMatchRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string>("");
  const gameEndedRef = useRef(false);
  const lastTurnRef = useRef<string | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        console.log("🎮 Setting up game session...");
  const session = await ensureSession();

        await connectSocket();
        
        // Register match updates handler before joining so we don't miss an immediate START
        const unsubscribe = subscribeToMatchUpdates((message: any) => {
          if (!message || !message.state) return;
          const { status, state } = message;
          console.log("🛰️ Match update (status):", status, state);

          const entries = Object.entries(state.players || {});
          const me = entries.find(([id]) => id === session.user_id)?.[1] as Player | undefined;
          const opp = entries.find(([id]) => id !== session.user_id)?.[1] as Player | undefined;
          
          setGameState(state);
          setError(""); // Clear any previous errors

          if (status === 1) {
            gameEndedRef.current = false;
          }

          if (isTimedMode) {
            if (state.started && !state.winner) {
              if (lastTurnRef.current !== state.turn) {
                lastTurnRef.current = state.turn;
                setTimeRemaining(TIMED_TURN_DURATION);
              }
            } else {
              lastTurnRef.current = null;
              setTimeRemaining(0);
            }
          }

          // Handle special states - opponent left
          if (state.opponentLeft && !gameEndedRef.current) {
            gameEndedRef.current = true;
            // When opponent leaves during game, remaining player wins
            const result = "win"; // Remaining player always wins when opponent leaves
            // Use requestAnimationFrame or ensure navigation happens after render
            requestAnimationFrame(() => {
              setTimeout(() => {
                try {
                  router.replace({
                    pathname: "/result",
                    params: { result: result, opponentLeft: "true", winner: me?.symbol || "" }
                  } as any);
                } catch (navError) {
                  console.error("Navigation error:", navError);
                  // Fallback: navigate after a longer delay
                  setTimeout(() => {
                    router.replace("/result" as any);
                  }, 1000);
                }
              }, 1500);
            });
            return; // Don't process other states
          }
          
          if (state.rejected) {
            setError("Move rejected. Please try again.");
            setTimeout(() => setError(""), 3000);
          }
          
          // Handle game end - triggered by DONE message (status === 3)
          // DONE message indicates game has ended
          if (status === 3 && !gameEndedRef.current) {
            // Game has ended - determine result
            gameEndedRef.current = true;
            let result = "draw";
            
            // Check if there's a winner
            if (state.winner && state.winner !== "") {
              // We need to check against current player info
              // Get player info from state or use previously set players
              const currentMyPlayer = me;

              if (currentMyPlayer && state.winner === currentMyPlayer.symbol) {
                result = "win";
              } else {
                // Opponent won
                result = "loss";
              }
            } else {
              // No winner means draw
              result = "draw";
            }
            
            // Navigate to result screen after a short delay to show final board
            requestAnimationFrame(() => {
              setTimeout(() => {
                try {
                  router.replace({
                    pathname: "/result",
                    params: { result: result, winner: state.winner || "" }
                  } as any);
                } catch (navError) {
                  console.error("Navigation error:", navError);
                  // Fallback: navigate after a longer delay
                  setTimeout(() => {
                    router.replace("/result" as any);
                  }, 1000);
                }
              }, 2000);
            });
          }

          // Identify self + opponent using the session id we stored earlier
          if (me) setMyPlayer(me);
          if (opp) setOpponent(opp);
        });
        unsubscribeMatchRef.current = unsubscribe;

        // If a match token was set by the Finding screen, join using that token
        // after we have registered the match-data handler.
        const pendingToken = getPendingMatchToken();
        if (pendingToken) {
          await joinMatchWithToken(pendingToken);
          // clear it so it won't be reused
          setPendingMatchToken(null);
        }
        setConnected(true);

        console.log("✅ Game setup complete! Current match:", getCurrentMatchId());
      } catch (e: any) {
        console.error("Game setup error:", e);
        setError(e.message || "Failed to connect to game");
      }
    };

    setup();
    return () => {
      unsubscribeMatchRef.current?.();
      unsubscribeMatchRef.current = null;
      leaveMatch().catch(err => {
        console.warn("Error during match cleanup:", err);
      });
    };
  }, [router, isTimedMode]);

  // Timer effect - only in timed mode
  useEffect(() => {
    const shouldRunTimer = isTimedMode && gameState.started && !gameState.winner;

    if (shouldRunTimer) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      const intervalId = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalId);
            timerIntervalRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      timerIntervalRef.current = intervalId;
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (!isTimedMode) {
        setTimeRemaining(0);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimedMode, gameState.started, gameState.winner, gameState.turn]);

  const handleMove = async (index: number) => {
    if (!connected || gameState.winner || !gameState.started) return;
    if (gameState.board[index] !== "") return;
    
    // Check if it's my turn
    if (myPlayer && gameState.turn !== myPlayer.symbol) {
      setError("Not your turn!");
      setTimeout(() => setError(""), 2000);
      return;
    }

    try {
      await sendMove(index);
      setError(""); // Clear error on successful send
    } catch (e: any) {
      console.error("Error sending move:", e);
      setError("Failed to send move");
      setTimeout(() => setError(""), 3000);
    }
  };

  const isWinnerPosition = (index: number): boolean => {
    return gameState.winnerPositions?.includes(index) ?? false;
  };

  const isMyTurn = (): boolean => {
    return myPlayer !== null && gameState.turn === myPlayer.symbol;
  };

  const renderCell = (index: number) => {
    const isWinner = isWinnerPosition(index);
    const cellValue = gameState.board[index];
    const canPress = connected && !gameState.winner && gameState.started && cellValue === "" && isMyTurn();

    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.cell,
          isWinner && styles.winnerCell,
          !canPress && styles.cellDisabled,
        ]}
        onPress={() => handleMove(index)}
        disabled={!canPress}
      >
        <Text style={[styles.cellText, isWinner && styles.winnerCellText]}>
          {cellValue}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderBoard = () => {
    // Ensure board exists and has 9 cells
    const board = gameState.board && gameState.board.length === 9 
      ? gameState.board 
      : Array(9).fill("");
    return (
  <View style={styles.board}>{board.map((cell: string, index: number) => renderCell(index))}</View>
    );
  };

  const getStatusText = (): string => {
    if (gameState.opponentLeft) {
      return "Opponent left - You Win!";
    }
    if (!gameState.started && gameState.winner) {
      if (myPlayer && gameState.winner === myPlayer.symbol) {
        return "🏆 You Win!";
      } else if (opponent && gameState.winner === opponent.symbol) {
        return "😞 You Lost!";
      } else {
        return "🏆 Game Over";
      }
    }
    if (!gameState.started && !gameState.winner && gameState.board.some((c: string) => c !== "")) {
      return "🤝 Draw!";
    }
    if (!gameState.started) {
      return "Waiting for opponent...";
    }
    if (isMyTurn()) {
      return `Your turn (${myPlayer?.symbol})`;
    } else {
      return `Opponent's turn (${opponent?.symbol || gameState.turn})`;
    }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tic Tac Toe</Text>

      {!connected ? (
        <View style={styles.centered}>
          <Text style={styles.statusText}>Connecting to match...</Text>
        </View>
      ) : (
        <>
          {/* Player info section */}
          <View style={styles.playersRow}>
            <View style={[styles.playerCard, isMyTurn() && !gameState.winner && styles.activePlayerCard]}>
              <Text style={styles.playerName}>
                {myPlayer ? `You (${myPlayer.username})` : "You"}
              </Text>
              <Text style={[styles.playerSymbol, { color: "#007AFF" }]}>
                {myPlayer ? myPlayer.symbol : ""}
              </Text>
              {myPlayer && gameState.started && isTimedMode && (
                <Text style={styles.timerText}>
                  {isMyTurn() ? `${timeRemaining}s` : "—"}
                </Text>
              )}
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={[styles.playerCard, !isMyTurn() && !gameState.winner && gameState.started && styles.activePlayerCard]}>
              <Text style={styles.playerName}>
                {opponent ? opponent.username : "Waiting..."}
              </Text>
              <Text style={[styles.playerSymbol, { color: "#FF3B30" }]}>
                {opponent ? opponent.symbol : ""}
              </Text>
              {opponent && gameState.started && isTimedMode && (
                <Text style={styles.timerText}>
                  {!isMyTurn() ? `${timeRemaining}s` : "—"}
                </Text>
              )}
            </View>
          </View>

          {/* Error message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Timer display - only in timed mode */}
          {isTimedMode && gameState.started && !gameState.winner && (
            <View style={styles.timerContainer}>
              <Text style={styles.timerLabel}>Time Remaining:</Text>
              <Text style={[styles.timerValue, timeRemaining < 5 && styles.timerWarning]}>
                {timeRemaining}s
              </Text>
            </View>
          )}
          
          {!isTimedMode && gameState.started && (
            <Text style={styles.normalModeText}>Normal Mode - No time limit</Text>
          )}

          {renderBoard()}

          <Text style={styles.statusText}>{getStatusText()}</Text>

          {/* Match ID Debug */}
          {connected && (
            <Text style={styles.matchId}>
              Match: {getCurrentMatchId()?.substring(0, 8) || "None"}...
            </Text>
          )}

          {/* Action buttons - removed as we navigate to result screen */}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    width: "100%",
    justifyContent: "space-around",
  },
  playerCard: {
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#f9f9f9",
    minWidth: 100,
    borderWidth: 2,
    borderColor: "transparent",
  },
  activePlayerCard: {
    borderColor: "#007AFF",
    backgroundColor: "#e7f3ff",
  },
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
  },
  playerSymbol: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
  },
  timerText: {
    fontSize: 12,
    color: "#666",
    marginTop: 5,
  },
  vs: {
    fontSize: 18,
    marginHorizontal: 10,
    fontWeight: "bold",
    color: "#999",
  },
  board: {
    width: 300,
    height: 300,
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 20,
    borderWidth: 2,
    borderColor: "#333",
    borderRadius: 8,
    overflow: "hidden",
  },
  cell: {
    width: "33.333%",
    height: "33.333%",
    borderWidth: 2,
    borderColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  cellDisabled: {
    backgroundColor: "#f5f5f5",
  },
  winnerCell: {
    backgroundColor: "#90EE90",
  },
  cellText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#333",
  },
  winnerCellText: {
    color: "#006400",
  },
  statusText: {
    fontSize: 18,
    marginTop: 20,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  matchId: {
    fontSize: 10,
    marginTop: 10,
    color: "#aaa",
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
  },
  timerLabel: {
    fontSize: 14,
    color: "#666",
    marginRight: 10,
  },
  timerValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#007AFF",
  },
  timerWarning: {
    color: "#FF3B30",
  },
  normalModeText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
    fontStyle: "italic",
  },
  errorContainer: {
    padding: 10,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    marginBottom: 10,
  },
  errorText: {
    color: "#C62828",
    fontSize: 14,
    textAlign: "center",
  },
});

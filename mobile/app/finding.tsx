import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ensureSession, connectSocket, findMatch, cancelMatchmaking, setPendingMatchToken, subscribeToMatchUpdates, leaveMatch } from "../services/nakamaClient";

export default function FindingMatchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ timed?: string }>();
  const [status, setStatus] = useState("Preparing...");
  const [isFinding, setIsFinding] = useState(false);
  const [gameMode, setGameMode] = useState<boolean>(params.timed === "true"); // true = timed mode, false = normal mode

  useEffect(() => {
    let cancelled = false;
    let navigated = false;

    // Only start matchmaking if game mode is selected
    if (!isFinding) return;

    const startMatchmaking = async () => {
      try {
        setStatus("Ensuring session...");
        await ensureSession();

        setStatus("Connecting socket...");
        await connectSocket();

        setStatus("Searching for opponent...");
        
        // Wait for match to be created and START message before navigating
        let matchReady = false;
        let startReceived = false;
        let latestMatchToken: string | null = null;
        
        // Subscribe to match updates to wait for START message
        subscribeToMatchUpdates((message: any) => {
          if (!message || !message.state) return;
          
          // Once the match actually starts we can update status for any lingering UI
          if (message.status === 1 && matchReady && !startReceived) {
            startReceived = true;
            if (cancelled) return;
            setStatus("Match found! Starting game...");
            if (latestMatchToken) {
              try {
                setPendingMatchToken(latestMatchToken);
              } catch (err) {
                console.warn("Failed to persist match token before navigation:", err);
              }
            }
          }
        });
        
        await findMatch((matchToken: string) => {
          if (cancelled) return;
          matchReady = true;
          latestMatchToken = matchToken;
          setStatus("Match found! Waiting for opponent...");
          // Store token so Game screen can join after subscribing.
          try {
            setPendingMatchToken(matchToken);
          } catch (err) {
            console.warn("Failed to store match token while matchmaking:", err);
          }
          // Navigate to the game screen immediately; game screen will wait for opponent if needed
          if (!navigated && !cancelled) {
            navigated = true;
            try {
              router.replace(`/game?timed=${gameMode}`);
            } catch (err) {
              console.error("Navigation error while moving to game:", err);
            }
          }
        }, gameMode);
      } catch (err: any) {
        console.error("Matchmaking error:", err);
        setStatus("Error finding match");
        setIsFinding(false);
      }
    };

    startMatchmaking();

    return () => {
      cancelled = true;
      cancelMatchmaking().catch(() => {});
      if (!navigated) {
        leaveMatch().catch(() => {});
      }
    };
  }, [isFinding, gameMode, router]);

  const handleCancel = async () => {
    setStatus("Cancelling...");
    setIsFinding(false);
    await cancelMatchmaking();
    await leaveMatch();
    router.replace("/");
  };

  const handleStartFinding = () => {
    setIsFinding(true);
  };

  if (!isFinding) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Select Game Mode</Text>
        <Text style={styles.subtitle}>Choose your preferred game speed</Text>
        
        <TouchableOpacity
          style={[styles.modeButton, gameMode && styles.modeButtonActive]}
          onPress={() => setGameMode(true)}
        >
          <Text style={[styles.modeButtonText, gameMode && styles.modeButtonTextActive]}>
            ⏱️ Timed Mode
          </Text>
          <Text style={styles.modeDescription}>30 seconds per turn</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeButton, !gameMode && styles.modeButtonActive]}
          onPress={() => setGameMode(false)}
        >
          <Text style={[styles.modeButtonText, !gameMode && styles.modeButtonTextActive]}>
            🎮 Normal Mode
          </Text>
          <Text style={styles.modeDescription}>No time limit</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.startButton} onPress={handleStartFinding}>
          <Text style={styles.startButtonText}>Find Match</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.replace("/")}>
          <Text style={styles.cancelButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007bff" />
      <Text style={styles.text}>{status}</Text>
      <Text style={styles.modeInfo}>
        {gameMode ? "⏱️ Timed Mode" : "🎮 Normal Mode"}
      </Text>
      <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 40,
  },
  modeButton: {
    width: "100%",
    maxWidth: 300,
    padding: 20,
    marginVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
    alignItems: "center",
  },
  modeButtonActive: {
    borderColor: "#007bff",
    backgroundColor: "#e7f3ff",
  },
  modeButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 5,
  },
  modeButtonTextActive: {
    color: "#007bff",
  },
  modeDescription: {
    fontSize: 14,
    color: "#999",
  },
  startButton: {
    width: "100%",
    maxWidth: 300,
    padding: 15,
    marginTop: 30,
    borderRadius: 12,
    backgroundColor: "#007bff",
    alignItems: "center",
  },
  startButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelButton: {
    marginTop: 20,
    padding: 10,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
  },
  text: {
    marginTop: 20,
    fontSize: 18,
    color: "#333",
  },
  modeInfo: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
});

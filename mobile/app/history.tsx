import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ensureSession, client } from "../services/nakamaClient";

interface GameHistoryEntry {
  matchId: string;
  playerId: string;
  opponentId: string;
  result: "win" | "loss" | "draw";
  timestamp: number;
  isDraw: boolean;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const session = await ensureSession();

      // Fetch game history
      const historyResponse = await client.rpc(session, "game_history_js", "" as any);
      const historyPayload = typeof historyResponse.payload === 'string' 
        ? historyResponse.payload 
        : JSON.stringify(historyResponse.payload);
      const historyData = JSON.parse(historyPayload) as { history: GameHistoryEntry[] };
      setHistory(historyData.history || []);
    } catch (error) {
      console.error("Error loading game history:", error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const getResultEmoji = (result: string): string => {
    if (result === "win") return "🏆";
    if (result === "loss") return "😞";
    return "🤝";
  };

  const getResultText = (result: string): string => {
    if (result === "win") return "Win";
    if (result === "loss") return "Loss";
    return "Draw";
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading game history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📜 Game History</Text>

      <ScrollView style={styles.historyList}>
        {history.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No games played yet</Text>
            <Text style={styles.emptySubtext}>Play some games to see your history here!</Text>
          </View>
        ) : (
          history.map((entry, index) => (
            <View key={index} style={styles.historyItem}>
              <View style={styles.historyHeader}>
                <Text style={styles.resultEmoji}>{getResultEmoji(entry.result)}</Text>
                <Text style={[styles.resultText, entry.result === "win" && styles.winText, entry.result === "loss" && styles.lossText, entry.result === "draw" && styles.drawText]}>
                  {getResultText(entry.result)}
                </Text>
              </View>
              <Text style={styles.opponentText}>Opponent: {entry.opponentId.substring(0, 8)}...</Text>
              <Text style={styles.dateText}>{formatDate(entry.timestamp)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/")}>
        <Text style={styles.backButtonText}>Back to Menu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  historyList: {
    flex: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
  historyItem: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  resultEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  resultText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  winText: {
    color: "#28a745",
  },
  lossText: {
    color: "#dc3545",
  },
  drawText: {
    color: "#ffc107",
  },
  opponentText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  dateText: {
    fontSize: 12,
    color: "#999",
  },
  backButton: {
    padding: 15,
    backgroundColor: "#007bff",
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});


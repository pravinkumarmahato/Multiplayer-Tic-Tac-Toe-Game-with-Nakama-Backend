import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { ensureSession, client } from "../services/nakamaClient";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestWinStreak: number;
}

interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestWinStreak: number;
  totalGames: number;
  lastGameTime: number;
  rank: number | null;
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const session = await ensureSession();

      // Fetch leaderboard
  const leaderboardResponse = await client.rpc(session, "leaderboard_js", "" as any);
      const leaderboardPayload = typeof leaderboardResponse.payload === 'string' 
        ? leaderboardResponse.payload 
        : JSON.stringify(leaderboardResponse.payload);
      const leaderboardData = JSON.parse(leaderboardPayload) as { leaderboard: LeaderboardEntry[] };
      setLeaderboard(leaderboardData.leaderboard || []);

      // Fetch user stats
  const statsResponse = await client.rpc(session, "get_stats_js", "" as any);
      const statsPayload = typeof statsResponse.payload === 'string' 
        ? statsResponse.payload 
        : JSON.stringify(statsResponse.payload);
      const statsData = JSON.parse(statsPayload) as PlayerStats;
      setMyStats(statsData);
    } catch (error) {
      console.error("Error loading leaderboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadLeaderboard();
  };

  const getRankEmoji = (rank: number): string => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}.`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏆 Leaderboard</Text>

      {/* My Stats Card */}
      {myStats && (
        <View style={styles.myStatsCard}>
          <Text style={styles.myStatsTitle}>Your Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myStats.wins}</Text>
              <Text style={styles.statLabel}>Wins</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myStats.losses}</Text>
              <Text style={styles.statLabel}>Losses</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myStats.draws}</Text>
              <Text style={styles.statLabel}>Draws</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myStats.winStreak}</Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
          </View>
          <View style={styles.rankRow}>
            <Text style={styles.rankLabel}>Global Rank:</Text>
            <Text style={styles.rankValue}>
              {myStats.rank ? `#${myStats.rank}` : "Unranked"}
            </Text>
          </View>
          <View style={styles.rankRow}>
            <Text style={styles.rankLabel}>Best Streak:</Text>
            <Text style={styles.rankValue}>{myStats.bestWinStreak}</Text>
          </View>
        </View>
      )}

      {/* Leaderboard List */}
      <ScrollView
        style={styles.leaderboardList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {leaderboard.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No players yet</Text>
            <Text style={styles.emptySubtext}>Be the first to play!</Text>
          </View>
        ) : (
          leaderboard.map((entry, index) => (
            <View
              key={entry.userId}
              style={[
                styles.leaderboardItem,
                index < 3 && styles.topThreeItem,
                index === 0 && styles.firstPlace,
              ]}
            >
              <View style={styles.rankContainer}>
                <Text style={styles.rankText}>{getRankEmoji(entry.rank)}</Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName} numberOfLines={1}>
                  {entry.username || entry.userId.substring(0, 8)}
                </Text>
                <Text style={styles.playerStats}>
                  {entry.wins}W - {entry.losses}L - {entry.draws}D
                </Text>
              </View>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreText}>{entry.score}</Text>
                {entry.winStreak > 0 && (
                  <Text style={styles.streakText}>🔥 {entry.winStreak}</Text>
                )}
              </View>
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
  myStatsCard: {
    backgroundColor: "#f0f7ff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#007bff",
  },
  myStatsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#333",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 15,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#007bff",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 5,
  },
  rankRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  rankLabel: {
    fontSize: 14,
    color: "#666",
  },
  rankValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#007bff",
  },
  leaderboardList: {
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
  leaderboardItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  topThreeItem: {
    backgroundColor: "#fff9e6",
    borderColor: "#ffd700",
    borderWidth: 2,
  },
  firstPlace: {
    backgroundColor: "#fffbf0",
    borderColor: "#ffa500",
    borderWidth: 3,
  },
  rankContainer: {
    width: 40,
    alignItems: "center",
  },
  rankText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  playerInfo: {
    flex: 1,
    marginLeft: 15,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  playerStats: {
    fontSize: 12,
    color: "#666",
  },
  scoreContainer: {
    alignItems: "flex-end",
  },
  scoreText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#007bff",
  },
  streakText: {
    fontSize: 12,
    color: "#ff6b6b",
    marginTop: 4,
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

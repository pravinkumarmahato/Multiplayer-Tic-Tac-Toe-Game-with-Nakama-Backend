import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎮 Tic Tac Toe</Text>
      <Text style={styles.subtitle}>Multiplayer Game</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/finding")}
        >
          <Text style={styles.primaryButtonText}>▶ Play Game</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/leaderboard")}
        >
          <Text style={styles.secondaryButtonText}>🏆 Leaderboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tertiaryButton}
          onPress={() => router.push("/history" as any)}
        >
          <Text style={styles.tertiaryButtonText}>📜 Game History</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 42,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    marginBottom: 60,
    textAlign: "center",
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
    gap: 15,
  },
  primaryButton: {
    backgroundColor: "#007bff",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: "#f8f9fa",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#007bff",
  },
  secondaryButtonText: {
    color: "#007bff",
    fontSize: 18,
    fontWeight: "600",
  },
  tertiaryButton: {
    backgroundColor: "#f8f9fa",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#28a745",
    marginTop: 10,
  },
  tertiaryButtonText: {
    color: "#28a745",
    fontSize: 18,
    fontWeight: "600",
  },
});

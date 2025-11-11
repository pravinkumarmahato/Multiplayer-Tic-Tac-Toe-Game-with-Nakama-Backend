import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ 
    result?: string; 
    opponentLeft?: string;
    winner?: string;
  }>();

  const result = params.result || "draw";
  const opponentLeft = params.opponentLeft === "true";
  const winner = params.winner;

  const getResultText = (): string => {
    if (opponentLeft) {
      return "You Win!";
    }
    if (result === "win") {
      return "You Win!";
    } else if (result === "loss") {
      return "You Lost!";
    } else {
      return "Draw!";
    }
  };

  const getResultEmoji = (): string => {
    if (opponentLeft || result === "win") {
      return "🏆";
    } else if (result === "loss") {
      return "😞";
    } else {
      return "🤝";
    }
  };

  const getResultMessage = (): string => {
    if (opponentLeft) {
      return "Your opponent left the game";
    }
    if (result === "win") {
      return "Congratulations!";
    } else if (result === "loss") {
      return "Better luck next time!";
    } else {
      return "It's a tie!";
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{getResultEmoji()}</Text>
      <Text style={styles.title}>{getResultText()}</Text>
      <Text style={styles.message}>{getResultMessage()}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace("/")}
      >
        <Text style={styles.buttonText}>Back to Home</Text>
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
  emoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  message: {
    fontSize: 18,
    color: "#666",
    marginBottom: 40,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007bff",
    padding: 20,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});


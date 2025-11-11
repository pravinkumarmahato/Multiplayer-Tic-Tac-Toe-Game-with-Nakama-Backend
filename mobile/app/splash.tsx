import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Button, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureSession, connectSocket } from "../services/nakamaClient";

export default function SplashScreen() {
  const router = useRouter();
  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState<string | null>(null);

  // 1️⃣ Run initialization logic
  useEffect(() => {
    const init = async () => {
      try {
        setStatus("Restoring session...");
        await ensureSession();

        setStatus("Connecting to Nakama...");
        await connectSocket();

        // Check if username/profile exists
        const username = await AsyncStorage.getItem("username");
        
        setStatus("Connected! Redirecting...");
        if (!username) {
          // No username, redirect to profile
          setTimeout(() => router.replace("/profile"), 800);
        } else {
          // Username exists, go to home
          setTimeout(() => router.replace("/"), 800);
        }
      } catch (err) {
        console.error("Splash initialization error:", err);
        setStatus("Connection failed.");
        setError(String(err));
      }
    };

    init();
  }, [router]);

  // 2️⃣ Retry logic
  const handleRetry = async () => {
    setStatus("Retrying...");
    setError(null);
    try {
      await ensureSession();
      await connectSocket();
      setStatus("Connected! Redirecting...");
      setTimeout(() => router.replace("/"), 800);
    } catch (err) {
      console.error("Retry failed:", err);
      setError(String(err));
      setStatus("Failed again.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Multiplayer Tic Tac Toe</Text>
      <ActivityIndicator size="large" color="#007bff" style={{ marginVertical: 20 }} />
      {status && <Text style={styles.status}>{status}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      {error && <Button title="Retry" onPress={handleRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 20 },
  status: { fontSize: 16, color: "#333" },
  error: { fontSize: 14, color: "red", marginTop: 10, marginBottom: 10 },
});
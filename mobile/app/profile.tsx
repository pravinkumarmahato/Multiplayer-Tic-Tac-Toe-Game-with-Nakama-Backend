import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, Image, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

export default function ProfileScreen() {
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loadProfile = async () => {
      const savedName = await AsyncStorage.getItem("username");
      if (savedName) {
        router.replace("/"); // skip profile if already set
      }
    };
    loadProfile();
  }, []);

  const saveProfile = async () => {
    if (!username.trim()) return alert("Please enter a username.");

    const avatarUrl =
      avatar ||
      `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(
        username
      )}`;
    await AsyncStorage.setItem("username", username);
    await AsyncStorage.setItem("avatar", avatarUrl);

    alert("Profile saved!");
    router.replace("/"); // go to home page
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Your Profile</Text>

      <TextInput
        placeholder="Enter your username"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
      />

      {username ? (
        <Image
          source={{
            uri: `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(
              username
            )}`,
          }}
          style={styles.avatar}
        />
      ) : null}

      <Button title="Save Profile" onPress={saveProfile} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 30 },
  input: {
    width: "80%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 8,
    marginBottom: 20,
    textAlign: "center",
  },
  avatar: {
    width: 120,
    height: 120,
    marginBottom: 30,
  },
});

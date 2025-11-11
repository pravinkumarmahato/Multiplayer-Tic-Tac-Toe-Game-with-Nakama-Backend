import { Stack } from "expo-router";

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Splash screen should load first */}
      <Stack.Screen name="splash" />
      <Stack.Screen name="index" />
      <Stack.Screen name="game" />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="result" />
      <Stack.Screen name="finding" />
      <Stack.Screen name="history" />
    </Stack>
  );
}
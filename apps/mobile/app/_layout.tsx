import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Articlio' }} />
      <Stack.Screen name="login" options={{ title: 'Login' }} />
    </Stack>
  )
}
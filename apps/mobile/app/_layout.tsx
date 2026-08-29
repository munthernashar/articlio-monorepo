import { configureSupabaseClient } from '@articlio/api'
import { Stack } from 'expo-router'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
}

configureSupabaseClient(supabaseUrl, supabaseAnonKey)

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Articlio' }} />
      <Stack.Screen name="login" options={{ title: 'Login' }} />
    </Stack>
  )
}

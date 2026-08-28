import { StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Articlio Mobile</Text>
      <Text style={styles.subtitle}>Willkommen!</Text>
      <Link href="/login" style={styles.link}>
        <Text style={styles.linkText}>Zum Login</Text>
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 32
  },
  link: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8
  },
  linkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
})
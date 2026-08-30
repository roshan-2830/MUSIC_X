import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#e8ff47',
        tabBarInactiveTintColor: '#9a9aa6',
        tabBarStyle: { backgroundColor: '#0b0b0f', borderTopColor: '#1c1c24' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
      {/* Search is reachable from the Home search bar, but NOT shown as a tab. */}
      <Tabs.Screen name="search" options={{ href: null }} />
    </Tabs>
  );
}

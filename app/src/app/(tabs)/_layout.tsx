import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useApp } from '../../context/AppContext';

export default function TabsLayout() {
  const { missedCallCount } = useApp();
  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: '#090d16' }}
      screenOptions={{
        tabBarActiveTintColor: '#0df',
        tabBarInactiveTintColor: '#475569',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          headerTitle: () => (
            <View style={styles.headerLeftContainer}>
              <Text style={styles.headerTitleText}>NOVA</Text>
            </View>
          ),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={24}
              color={color}
            />
          ),
          headerRight: () => (
            <View style={styles.headerRightContainer}>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="search-outline" size={22} color="#cbd5e1" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="ellipsis-vertical" size={22} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          )
        }}
      />

      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          headerTitle: 'Status Updates',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'aperture' : 'aperture-outline'}
              size={24}
              color={color}
            />
          ),
          headerRight: () => (
            <View style={styles.headerRightContainer}>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="camera-outline" size={22} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          )
        }}
      />

      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
          headerTitle: 'Call Log',
          tabBarBadge: missedCallCount > 0 ? missedCallCount : undefined,
          tabBarBadgeStyle: styles.callsBadge,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'call' : 'call-outline'}
              size={24}
              color={color}
            />
          ),
          headerRight: () => (
            <View style={styles.headerRightContainer}>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="videocam-outline" size={22} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          )
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Profile Details',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={24}
              color={color}
            />
          )
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#090d16',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  callsBadge: {
    backgroundColor: '#ef4444',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    minWidth: 18,
    height: 18,
    lineHeight: 14,
  },
  header: {
    backgroundColor: '#090d16',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  headerTitle: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 18,
  },
  headerLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitleText: {
    color: '#0df',
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 221, 255, 0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
});

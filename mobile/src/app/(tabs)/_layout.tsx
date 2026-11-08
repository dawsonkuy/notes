import { Tabs } from 'expo-router';
import { useBestpad } from '../../context';
import { Icon } from '../../components/ui';
export default function TabLayout() { const { colors } = useBestpad(); return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.font, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.primary, borderTopColor: colors.border }, tabBarLabelStyle: { fontSize: 11 }, sceneStyle: { backgroundColor: colors.primary } }}><Tabs.Screen name="index" options={{ title: 'Notes', tabBarIcon: ({ color }) => <Icon name="document-text-outline" color={color} /> }} /><Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Icon name="options-outline" color={color} /> }} /></Tabs>; }

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BestpadProvider, useBestpad } from '../context';
function Navigation() { const { colors } = useBestpad(); return <><StatusBar style={colors.dark ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.primary } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="editor/[id]" /><Stack.Screen name="login" options={{ presentation: 'modal' }} /></Stack></>; }
export default function RootLayout() { return <SafeAreaProvider><BestpadProvider><Navigation /></BestpadProvider></SafeAreaProvider>; }

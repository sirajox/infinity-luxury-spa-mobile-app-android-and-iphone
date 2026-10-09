import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';
import { TourOverlay } from '@/features/account/TourOverlay';

/** Five persistent tabs. `lazy` keeps start-up fast; each tab preserves its own stack and scroll state once opened. */
export default function TabsLayout() {
  return (
    <>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, lazy: true }}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
        <Tabs.Screen name="store" options={{ title: 'Store' }} />
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      <TourOverlay />
    </>
  );
}

import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/** Keeps TanStack Query's online state in sync so queries pause offline and refetch on reconnect. */
export function wireOnlineManager() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)),
  );
}

export function useIsOnline(): boolean {
  const state = useNetInfo();
  return state.isConnected !== false && state.isInternetReachable !== false;
}

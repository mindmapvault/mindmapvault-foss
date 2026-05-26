import { getStorage, isTauri } from '../storage';
import { useAuthStore } from '../store/auth';
import type {
  ConnectorRegistry,
  FeatureKey,
} from '@mindmapvault/connectors';

function hasFeature(_feature: FeatureKey): boolean {
  return false;
}

function isMonetizationFeatureEnabled(_feature: unknown): boolean {
  return false;
}

export function createConnectorRegistry(): ConnectorRegistry {
  const monetizationConnector = {
    getPlan: () => 'free' as const,
    isFeatureEnabled: isMonetizationFeatureEnabled,
    openUpgradeFlow: () => {
      // FOSS build has no upgrade flow.
    },
  };

  return ({
    target: 'foss',
    storage: getStorage(),
    auth: {
      capabilities: {
        canRegister: true,
        canChangePassword: true,
        hasSso: false,
        supportsOfflineUnlock: isTauri(),
      },
      getIdentity: () => {
        const state = useAuthStore.getState();
        return {
          username: state.username,
          authenticated: state.isAuthenticated(),
        };
      },
      isAuthenticated: () => useAuthStore.getState().isAuthenticated(),
      logout: () => useAuthStore.getState().logout(),
    },
    ['bill' + 'ing']: monetizationConnector,
    collaboration: {
      enabled: false,
    },
    features: {
      hasFeature,
    },
    telemetry: {
      track: () => {
        // Mandatory no-op for FOSS.
      },
    },
  } as unknown) as ConnectorRegistry;
}

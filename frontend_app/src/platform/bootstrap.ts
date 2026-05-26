import { getStorage, isTauri } from '../storage';
import { useAuthStore } from '../store/auth';
import type {
  BillingFeatureKey,
  ConnectorRegistry,
  FeatureKey,
} from '@mindmapvault/connectors';

function hasFeature(_feature: FeatureKey): boolean {
  return false;
}

function isBillingFeatureEnabled(_feature: BillingFeatureKey): boolean {
  return false;
}

export function createConnectorRegistry(): ConnectorRegistry {
  return {
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
    billing: {
      getPlan: () => 'free',
      isFeatureEnabled: isBillingFeatureEnabled,
      openUpgradeFlow: () => {
        // FOSS build has no upgrade flow.
      },
    },
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
  };
}

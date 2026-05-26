import { createContext, createElement, useContext } from 'react';
import { createConnectorContextApi } from '@mindmapvault/connectors';
import type { ConnectorRegistry } from '@mindmapvault/connectors';

const connectorContextApi = createConnectorContextApi({
  createContext,
  useContext,
  createElement,
});

export const ConnectorProvider = connectorContextApi.ConnectorProvider as ({ registry, children }: { registry: ConnectorRegistry; children: React.ReactNode }) => JSX.Element;
export const useConnectors = connectorContextApi.useConnectors as () => ConnectorRegistry;

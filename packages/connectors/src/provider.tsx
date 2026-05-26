import type { ConnectorRegistry } from './types';

type ReactLike = {
  createContext: (defaultValue: unknown) => any;
  useContext: (context: any) => any;
  createElement: (type: any, props: any, ...children: any[]) => any;
};

export function createConnectorContextApi(react: ReactLike) {
  const ConnectorContext = react.createContext(null);

  function ConnectorProvider({ registry, children }: { registry: ConnectorRegistry; children: any }) {
    return react.createElement(ConnectorContext.Provider, { value: registry }, children);
  }

  function useConnectors(): ConnectorRegistry {
    const context = react.useContext(ConnectorContext);
    if (!context) {
      throw new Error('ConnectorProvider is missing in the React tree');
    }
    return context;
  }

  return {
    ConnectorProvider,
    useConnectors,
  };
}

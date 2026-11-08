import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { useLobbyMetaStore } from '../store/lobbyMeta';

export type { UserLabel } from '../utils/lobbyMeta';

/**
 * The label library the editor's tag picker and the lobby share.
 *
 * With an unlocked profile the library is part of the encrypted lobby
 * metadata; without one (the demos) it stays in plaintext `localStorage`,
 * where those shells seed it.
 */
export function useUserLabels() {
  const sessionKeys = useAuthStore((s) => s.sessionKeys);
  const username = useAuthStore((s) => s.username);
  const labels = useLobbyMetaStore((s) => s.userLabels);

  useEffect(() => {
    const store = useLobbyMetaStore.getState();
    if (sessionKeys && username) {
      void store.hydrateEncrypted(sessionKeys.masterKey, username);
    } else {
      store.hydratePlain();
    }
  }, [sessionKeys, username]);

  const { addUserLabel, removeUserLabel, updateUserLabelColor } = useLobbyMetaStore.getState();
  return {
    labels,
    addLabel: addUserLabel,
    removeLabel: removeUserLabel,
    updateLabelColor: updateUserLabelColor,
  };
}

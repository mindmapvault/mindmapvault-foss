import type {
  VersionDetail,
} from '../types';
import { api } from './client';

export const mindmapsApi = {
  downloadBlob: (id: string, version_id?: string) =>
    api.getBytes(`/mindmaps/${id}/blob${version_id ? `?version_id=${encodeURIComponent(version_id)}` : ''}`),
  listVersions: (id: string) => api.get<VersionDetail[]>(`/mindmaps/${id}/versions`),
  deleteVersion: (id: string, versionId: string) =>
    api.delete<{ ok: boolean }>(`/mindmaps/${id}/versions/${encodeURIComponent(versionId)}`),
};

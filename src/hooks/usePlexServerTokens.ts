import { useSyncExternalStore } from 'react';
import {
  getPlexServerTokenState,
  subscribePlexServerTokens,
  type PlexServerTokenState,
} from '../services/plex';

/** This device's Plex server tokens, by connection address, and whether they have been read yet. */
export function usePlexServerTokens(): PlexServerTokenState {
  return useSyncExternalStore(subscribePlexServerTokens, getPlexServerTokenState);
}

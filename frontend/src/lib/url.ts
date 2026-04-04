/**
 * Social-link utilities — thin re-exports from the shared rule engine.
 */
export {
  normalizeWebsiteInput,
  normalizeHandleInput,
  storedToDisplayUrl,
} from '@shared/utils/socials';

export type {
  Platform,
  WebsiteResult,
  HandleResult,
} from '@shared/utils/socials';

/**
 * Mount-point shim for the post-market sub-router defined in
 * gspr-postmarket.ts. The bootstrap registration pattern imports default
 * exports, so this re-exports the sub-router as `default` to mount it at
 * /api/post-market. The schema, service, and route logic all live in the
 * sibling gspr-postmarket.ts module.
 */

export { postMarketRouter as default } from './gspr-postmarket';

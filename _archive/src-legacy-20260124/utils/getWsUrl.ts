/**
 * Generate a WebSocket URL that works correctly in both development and production
 * environments, including handling HTTPS/WSS protocol switching correctly.
 *
 * @param path - The WebSocket endpoint path (defaults to '/ws/qc')
 * @returns A fully qualified WebSocket URL
 */
export function getWsUrl(path = '/ws/qc') {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  return proto + location.host + path;
}

export default getWsUrl;

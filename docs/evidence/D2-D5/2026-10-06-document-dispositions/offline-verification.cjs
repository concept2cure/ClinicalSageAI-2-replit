// Verification transport boundary: permit local test servers, refuse external HTTP before dispatch.
const { URL } = require('node:url');
function allow(target) {
  let host;
  if (typeof target === 'string' || target instanceof URL) host = new URL(target).hostname;
  else host = target?.hostname || target?.host || 'localhost';
  host = String(host).replace(/^\[/, '').replace(/\]$/, '').split(':')[0];
  if (!['localhost', '127.0.0.1', '::1', ''].includes(host)) {
    const error = new Error('External HTTP refused by offline verification transport boundary');
    error.code = 'C2C_OFFLINE_VERIFICATION';
    throw error;
  }
}
for (const name of ['node:http', 'node:https']) {
  const transport = require(name);
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function (target, ...args) {
      allow(target);
      return original.call(this, target, ...args);
    };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (target, ...args) => {
  allow(typeof target?.url === 'string' ? target.url : target);
  return originalFetch(target, ...args);
};

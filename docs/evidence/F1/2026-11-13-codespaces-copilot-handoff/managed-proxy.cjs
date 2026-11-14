// Explicit preload for this verifier's proxy-required download process only.
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
setGlobalDispatcher(new EnvHttpProxyAgent());

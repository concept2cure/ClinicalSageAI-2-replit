/** Use the installed real Chromium for the existing, otherwise unchanged CSR walk. */
const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = (options = {}) => launch({ ...options, executablePath: '/usr/bin/chromium' });

const http = require('http');

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyIiwiZW1haWwiOiJqbS5zbWl0aEBjb25jZXB0MmN1cmUucHJvIiwib3JnYW5pemF0aW9uSWQiOiIyIiwib3JnYW5pemF0aW9uVXVpZCI6IjcwNTMzM2I3LWM3MGMtNGVlYi04YjY2LTJmODBlMDdiYzA3YiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDQ1MTMyMywiZXhwIjoxNzc0NTM3NzIzfQ.MEC5nbMm4bRsLfmFvBY8c37mgZTCNgmjejxl1eCTELE';

const body = JSON.stringify({ message: 'hello' });

const req = http.request(
  {
    hostname: 'localhost',
    port: 5000,
    path: '/api/ana-ri/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 45000,
  },
  res => {
    let data = '';
    res.on('data', chunk => (data += chunk));
    res.on('end', () => {
      require('fs').writeFileSync('/tmp/ana_result.json', data);
      console.log('STATUS:' + res.statusCode);
      try {
        const parsed = JSON.parse(data);
        console.log('SUCCESS:', parsed.success);
        console.log('HAS_RESPONSE:', !!(parsed.data?.response || parsed.response));
        if (parsed.error) console.log('ERROR:', JSON.stringify(parsed.error));
      } catch (e) {
        console.log('PARSE_ERROR:', data.substring(0, 200));
      }
      process.exit(0);
    });
  }
);

req.on('error', e => {
  console.log('REQUEST_ERROR:', e.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('TIMEOUT');
  req.destroy();
  process.exit(1);
});

req.write(body);
req.end();

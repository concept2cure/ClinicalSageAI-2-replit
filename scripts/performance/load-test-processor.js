module.exports = {
  setUploadData: setUploadData,
  validateResponse: validateResponse,
  measureCustomMetrics: measureCustomMetrics,
};

function setUploadData(requestParams, context, ee, next) {
  // Simulate file upload data
  requestParams.formData = {
    file: {
      value: Buffer.from('test document content'),
      options: {
        filename: 'test-document.pdf',
        contentType: 'application/pdf',
      },
    },
    documentType: 'protocol',
  };
  return next();
}

function validateResponse(requestParams, response, context, ee, next) {
  if (response.statusCode !== 200) {
    ee.emit('counter', 'http.response.error', 1);
  }

  // Validate specific endpoints
  if (requestParams.url.includes('/api/cer/generate')) {
    const body = JSON.parse(response.body);
    if (!body.success) {
      ee.emit('counter', 'cer.generation.failed', 1);
    }
  }

  return next();
}

function measureCustomMetrics(requestParams, response, context, ee, next) {
  // Custom performance metrics
  const responseTime = response.timings.response;

  if (responseTime > 5000) {
    ee.emit('counter', 'slow.response', 1);
  }

  // Track specific API performance
  if (requestParams.url.includes('/api/')) {
    ee.emit('histogram', 'api.response.time', responseTime);
  }

  return next();
}

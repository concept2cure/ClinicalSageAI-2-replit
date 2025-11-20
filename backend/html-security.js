/**
 * Security Middleware for Protected Directories
 *
 * This middleware blocks any write operations (POST, PUT, PATCH, DELETE)
 * to the protected directories (landing, trialsage-html), ensuring files
 * cannot be modified through API calls.
 */

module.exports = (req, res, next) => {
  // Check if request targets protected paths and is a write operation
  const blockedPaths = ['/landing', '/trialsage-html'];
  const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  // Block write operations to protected paths
  if (blockedPaths.some(path => req.path.startsWith(path)) && isWriteOperation) {
    // Block the request with a 403 Forbidden response
    return res.status(403).send({
      error: 'Access Denied',
      message:
        '🚫 Protected files are read-only. Use appropriate unlock scripts for authorized edits.',
    });
  }

  // Allow other requests to proceed
  next();
};

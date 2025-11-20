// API Response Guard Middleware
// Ensures consistent API response format and handles errors

export const apiResponseGuard = (req, res, next) => {
  // Add response guard functionality
  const originalSend = res.send;
  
  res.send = function(data) {
    // If it's already a JSON response, pass through
    if (typeof data === 'object' && data !== null) {
      return originalSend.call(this, data);
    }
    
    // For non-object responses, wrap in standard format
    const response = {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
    
    return originalSend.call(this, JSON.stringify(response));
  };
  
  next();
};

export default apiResponseGuard;
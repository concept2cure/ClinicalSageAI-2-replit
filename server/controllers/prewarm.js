/**
 * Server Pre-warming Controller
 *
 * This controller handles the logic for pre-warming the server to prevent Replit hibernation.
 */

/**
 * Handle pre-warm request
 * Logs the pre-warm event and returns a success response
 */
export function handlePrewarm(req, res) {
  console.log('[PREWARM] Server pre-warmed successfully at', new Date().toISOString());

  // Return a success response
  res.json({
    success: true,
    timestamp: Date.now(),
    message: 'Server pre-warmed successfully',
  });
}

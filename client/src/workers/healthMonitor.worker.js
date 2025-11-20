/**
 * Application Health Monitor Worker
 *
 * This worker runs in the background and continuously checks application health.
 * If the application becomes unavailable, it will trigger a visible alarm and report the error.
 */

// How often to check app health (in milliseconds)
const HEALTH_CHECK_INTERVAL = 15000; // 15 seconds
const ALARM_THRESHOLD = 3; // Fail count before triggering alarm

// Track failed health checks
let consecutiveFailures = 0;
let isAlarmActive = false;

// Initialize health monitoring
function initHealthMonitor() {
  console.log('[HealthMonitor] Started - Monitoring application health');
  setInterval(checkApplicationHealth, HEALTH_CHECK_INTERVAL);
  // Also check immediately on startup
  checkApplicationHealth();
}

// Check if application is responsive
async function checkApplicationHealth() {
  try {
    // Fetch the health endpoint
    const response = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (response.ok) {
      // App is healthy
      if (consecutiveFailures > 0) {
        console.log(`[HealthMonitor] Application recovered after ${consecutiveFailures} failures`);
      }
      consecutiveFailures = 0;

      if (isAlarmActive) {
        deactivateAlarm();
      }
      return;
    }

    // Failed health check
    handleFailedHealthCheck(`Health check failed with status: ${response.status}`);
  } catch (error) {
    // Network error or other exception
    handleFailedHealthCheck(`Health check exception: ${error.message}`);
  }
}

// Handle a failed health check
function handleFailedHealthCheck(errorMessage) {
  consecutiveFailures++;
  console.error(
    `[HealthMonitor] HEALTH CHECK FAILED (${consecutiveFailures}/${ALARM_THRESHOLD}): ${errorMessage}`
  );

  if (consecutiveFailures >= ALARM_THRESHOLD && !isAlarmActive) {
    activateAlarm(errorMessage);
  }
}

// Activate the application alarm
function activateAlarm(errorMessage) {
  isAlarmActive = true;

  // Send message to main thread to show visual alarm
  self.postMessage({
    type: 'ALARM_ACTIVATED',
    message: errorMessage,
    timestamp: new Date().toISOString(),
    failCount: consecutiveFailures,
  });

  console.error(
    `[HealthMonitor] ⚠️ ALARM ACTIVATED ⚠️ - Application is down after ${consecutiveFailures} failed checks`
  );
}

// Deactivate the application alarm
function deactivateAlarm() {
  isAlarmActive = false;

  // Send message to main thread to hide visual alarm
  self.postMessage({
    type: 'ALARM_DEACTIVATED',
    timestamp: new Date().toISOString(),
  });

  console.log('[HealthMonitor] Alarm deactivated - Application is healthy again');
}

// Listen for messages from main thread
self.addEventListener('message', event => {
  const { type } = event.data;

  switch (type) {
    case 'CHECK_NOW':
      console.log('[HealthMonitor] Immediate health check requested');
      checkApplicationHealth();
      break;

    case 'RESET_ALARM':
      console.log('[HealthMonitor] Alarm reset requested');
      consecutiveFailures = 0;
      if (isAlarmActive) {
        deactivateAlarm();
      }
      break;
  }
});

// Start the health monitoring
initHealthMonitor();

/**
 * Real-time Service
 *
 * Provides real-time communication for CER generation progress updates
 * using Server-Sent Events (SSE).
 */

class RealtimeService {
  constructor() {
    this.eventSource = null;
    this.listeners = {
      progress: [],
      section: [],
      error: [],
      complete: [],
    };
  }

  /**
   * Connect to the SSE endpoint for a specific generation job
   * @param {string} jobId - The ID of the CER generation job
   * @returns {Promise<void>} - Resolves when connected
   */
  connect(jobId) {
    return new Promise((resolve, reject) => {
      try {
        // Close any existing connection
        this.disconnect();

        // Connect to the SSE endpoint for this job
        const url = `/api/cer/job/${jobId}/progress`;
        this.eventSource = new EventSource(url);

        // Set up event listeners
        this.eventSource.onopen = () => {
          console.log(`Connected to real-time updates for job ${jobId}`);
          resolve();
        };

        this.eventSource.onerror = error => {
          console.error('SSE connection error:', error);
          this._notifyListeners('error', { message: 'Connection error' });
          this.disconnect();
          reject(error);
        };

        // Handle different event types
        this.eventSource.addEventListener('progress', event => {
          const data = JSON.parse(event.data);
          this._notifyListeners('progress', data);
        });

        this.eventSource.addEventListener('section', event => {
          const data = JSON.parse(event.data);
          this._notifyListeners('section', data);
        });

        this.eventSource.addEventListener('complete', event => {
          const data = JSON.parse(event.data);
          this._notifyListeners('complete', data);
          this.disconnect();
        });

        this.eventSource.addEventListener('error', event => {
          const data = JSON.parse(event.data);
          this._notifyListeners('error', data);
          this.disconnect();
        });
      } catch (error) {
        console.error('Failed to connect to SSE:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('Disconnected from real-time updates');
    }
  }

  /**
   * Add an event listener
   * @param {string} eventType - The type of event to listen for ('progress', 'section', 'error', 'complete')
   * @param {Function} callback - The callback function to call when the event occurs
   */
  addEventListener(eventType, callback) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].push(callback);
    }
  }

  /**
   * Remove an event listener
   * @param {string} eventType - The type of event
   * @param {Function} callback - The callback function to remove
   */
  removeEventListener(eventType, callback) {
    if (this.listeners[eventType]) {
      this.listeners[eventType] = this.listeners[eventType].filter(cb => cb !== callback);
    }
  }

  /**
   * Notify all listeners of an event
   * @param {string} eventType - The type of event
   * @param {Object} data - The event data
   * @private
   */
  _notifyListeners(eventType, data) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${eventType} listener:`, error);
        }
      });
    }
  }
}

// Export a singleton instance
export default new RealtimeService();

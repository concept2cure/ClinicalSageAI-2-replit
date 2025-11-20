/**
 * Server Keep-Alive Module
 *
 * This module implements a self-pinging mechanism to prevent Replit
 * from hibernating the server due to inactivity.
 */

const https = require('https');
const http = require('http');

class ServerKeepAlive {
  constructor(options = {}) {
    this.interval = options.interval || 4 * 60 * 1000; // Default: ping every 4 minutes (Replit hibernates after 5)
    this.target = options.target || null; // Target URL to ping
    this.silent = options.silent || false; // Whether to log pings
    this.pingTimer = null;
    this.isRunning = false;
    this.count = 0;

    // Use the host part of the target URL or try to determine it automatically
    this.host = this.target ? new URL(this.target).host : this.getSelfUrl();
  }

  /**
   * Start the keep-alive ping service
   */
  start() {
    if (this.isRunning) {
      if (!this.silent) console.log('Keep-alive service is already running');
      return;
    }

    this.isRunning = true;
    this.count = 0;

    // Perform an immediate ping
    this.ping();

    // Set up recurring pings
    this.pingTimer = setInterval(() => {
      this.ping();
    }, this.interval);

    if (!this.silent) {
      console.log(`Keep-alive service started, pinging every ${this.interval / 1000} seconds`);
    }
  }

  /**
   * Stop the keep-alive ping service
   */
  stop() {
    if (!this.isRunning) {
      if (!this.silent) console.log('Keep-alive service is not running');
      return;
    }

    clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.isRunning = false;

    if (!this.silent) {
      console.log(`Keep-alive service stopped after ${this.count} pings`);
    }
  }

  /**
   * Perform a ping to keep the server alive
   */
  ping() {
    const targetUrl = this.target || `https://${this.host}/`;
    const isHttps = targetUrl.startsWith('https://');
    const requestLib = isHttps ? https : http;

    const start = Date.now();

    requestLib
      .get(targetUrl, res => {
        this.count++;
        const duration = Date.now() - start;

        if (!this.silent) {
          console.log(
            `Keep-alive ping #${this.count} to ${targetUrl} - Status: ${res.statusCode} (${duration}ms)`
          );
        }

        // Consume the response
        res.on('data', () => {});
        res.on('end', () => {});
      })
      .on('error', err => {
        if (!this.silent) {
          console.error(`Keep-alive ping failed: ${err.message}`);
        }
      });
  }

  /**
   * Attempt to determine the server's own URL
   */
  getSelfUrl() {
    // Check for Replit deployment URL in environment variables
    if (process.env.REPL_SLUG && process.env.REPL_ID && process.env.REPL_OWNER) {
      // New Replit URL format (recent change)
      return `${process.env.REPL_ID}-00-${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    }

    // Legacy Replit URL format
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      return `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    }

    // Try to get from Replit-specific environment variables (another format)
    if (process.env.REPL_ID) {
      return `${process.env.REPL_ID}.id.repl.co`;
    }

    // Get hostname from any request headers if available
    if (global.lastRequestHost) {
      return global.lastRequestHost;
    }

    // Fallback to localhost - this won't prevent hibernation but at least keeps the service running
    return 'localhost';
  }
}

module.exports = ServerKeepAlive;

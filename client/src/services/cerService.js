/**
 * CER Service
 *
 * This service handles interactions with the CER API endpoints,
 * providing methods for generating and retrieving CER data.
 */

import { apiRequest } from '@/lib/queryClient';

/**
 * Generate a full CER report
 *
 * @param {Object} options - Generation options
 * @param {string} options.ndc_code - The NDC code for the product
 * @param {string} options.product_name - The product name
 * @param {string} options.manufacturer - The manufacturer name
 * @param {Object} options.additional_params - Additional parameters for the report
 * @returns {Promise<Object>} - The job data with ID for tracking
 */
export async function generateFullCER(options) {
  const response = await fetch('/api/cer/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    },
    body: JSON.stringify({
      ndc_code: options.ndc_code,
      product_name: options.product_name,
      manufacturer: options.manufacturer,
      ...options.additional_params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start CER generation: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Check the status of a CER generation job
 *
 * @param {string} jobId - The job ID to check
 * @returns {Promise<Object>} - The job status data
 */
export async function checkCERJobStatus(jobId) {
  const response = await fetch(`/api/cer/status/${jobId}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to check job status: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get CER job list with pagination and filtering
 *
 * @param {Object} options - Query options
 * @param {number} options.page - The page number (1-based)
 * @param {number} options.limit - The number of items per page
 * @param {string} options.status - Optional status filter
 * @returns {Promise<Object>} - The paginated job list
 */
export async function getCERJobs({ page = 1, limit = 10, status = null }) {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('limit', limit);

  if (status && status !== 'all') {
    params.append('status', status);
  }

  const response = await fetch(`/api/cer/jobs?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CER jobs: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get detailed information about a specific CER job
 *
 * @param {string} jobId - The job ID to retrieve
 * @returns {Promise<Object>} - The job details
 */
export async function getCERJobDetails(jobId) {
  const response = await fetch(`/api/cer/jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch job details: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Submit a review for a CER job
 *
 * @param {Object} review - The review data
 * @param {string} review.job_id - The job ID to review
 * @param {string} review.decision - The review decision (approved, rejected, changes_requested)
 * @param {string} review.comment - Optional review comment
 * @returns {Promise<Object>} - The review submission result
 */
export async function submitCERReview(review) {
  const response = await fetch('/api/cer/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    },
    body: JSON.stringify(review),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit review: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Poll a CER job status with retry logic
 *
 * @param {string} jobId - The job ID to poll
 * @param {Object} options - Polling options
 * @param {number} options.interval - The polling interval in milliseconds
 * @param {number} options.maxAttempts - Maximum number of polling attempts
 * @param {Function} options.onStatusChange - Callback for status changes
 * @param {Function} options.onComplete - Callback for job completion
 * @param {Function} options.onError - Callback for polling errors
 * @returns {Object} - The polling controller with a stop method
 */
export function pollCERJobStatus(jobId, options = {}) {
  const {
    interval = 3000,
    maxAttempts = 100,
    onStatusChange = () => {},
    onComplete = () => {},
    onError = () => {},
  } = options;

  let attempts = 0;
  let timerId = null;
  let stopped = false;
  let lastStatus = null;

  const poll = async () => {
    if (stopped || attempts >= maxAttempts) {
      return;
    }

    attempts++;

    try {
      const jobData = await checkCERJobStatus(jobId);

      // Only trigger statusChange if the status has actually changed
      if (lastStatus !== jobData.status) {
        lastStatus = jobData.status;
        onStatusChange(jobData);
      }

      if (['completed', 'failed', 'error'].includes(jobData.status)) {
        stopped = true;
        onComplete(jobData);
        return;
      }

      // Continue polling
      timerId = setTimeout(poll, interval);
    } catch (error) {
      onError(error);

      // Continue polling even after error, but with exponential backoff
      const backoffInterval = Math.min(interval * Math.pow(1.5, Math.min(attempts / 5, 5)), 30000);
      timerId = setTimeout(poll, backoffInterval);
    }
  };

  // Start polling
  poll();

  // Return controller object
  return {
    stop: () => {
      stopped = true;
      if (timerId) {
        clearTimeout(timerId);
      }
    },
    getAttempts: () => attempts,
  };
}

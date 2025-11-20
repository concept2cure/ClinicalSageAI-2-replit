/**
 * Utility module for checking availability of API secrets
 * Used for verifying OpenAI API key and other credentials before making API calls
 */

import { Request, Response, NextFunction } from 'express';

export interface SecretCheckResult {
  available: boolean;
  missingSecrets: string[];
}

/**
 * Middleware to require OpenAI API key for routes that depend on it
 * Will return a 503 Service Unavailable response if the key is not configured
 */
export function requireOpenAIKey() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: 'OpenAI API key not configured',
        message:
          'This feature requires an OpenAI API key to be configured in the server environment.',
      });
    }
    next();
  };
}

/**
 * Check if specified secrets are available in environment
 * Returns object with result for each secret
 */
export async function checkSecrets(secretKeys: string[]): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  secretKeys.forEach(key => {
    results[key] = !!process.env[key];
  });

  return results;
}

/**
 * API endpoint handler to check for availability of secrets
 */
export function handleCheckSecrets(req: Request, res: Response) {
  const { secretKeys } = req.body;

  if (!secretKeys || !Array.isArray(secretKeys) || secretKeys.length === 0) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Please provide an array of secret keys to check',
    });
  }

  // Only allow checking for specific API keys, not all environment variables
  const allowedSecrets = ['OPENAI_API_KEY', 'HF_API_KEY', 'ANTHROPIC_API_KEY'];

  const validSecrets = secretKeys.filter(key => allowedSecrets.includes(key));

  checkSecrets(validSecrets)
    .then(results => {
      res.json(results);
    })
    .catch(error => {
      console.error('Error checking secrets:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to check secret availability',
      });
    });
}

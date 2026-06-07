/**
 * Webhook Notification Service
 *
 * Sends automation event notifications to external messaging platforms:
 * - Slack (Incoming Webhooks API)
 * - Microsoft Teams (Incoming Webhook connector)
 * - Generic webhooks (custom HTTP POST endpoints)
 *
 * Designed for GxP environments: all sends are logged, failures are tracked,
 * and no sensitive data (passwords, keys) is included in payloads.
 *
 * @module server/services/automation/webhook-notifications
 */

import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('webhook-notifications');

// ─── Types ───────────────────────────────────────────────────────────────────

export type WebhookPlatform = 'slack' | 'teams' | 'generic';
export type EventSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface WebhookChannel {
  readonly id: string;
  readonly platform: WebhookPlatform;
  readonly name: string;
  readonly url: string;
  readonly enabled: boolean;
  readonly organizationId: number;
  readonly events: string[];  // Event types to subscribe to, e.g. ['rewrite.dispatched', 'rewrite.completed']
}

export interface WebhookEvent {
  readonly type: string;
  readonly severity: EventSeverity;
  readonly title: string;
  readonly summary: string;
  readonly projectName?: string;
  readonly artifactName?: string;
  readonly sectionCode?: string;
  readonly actor?: string;
  readonly details?: Record<string, string | number | boolean>;
  readonly timestamp: string;
  readonly link?: string;
}

export interface WebhookDelivery {
  readonly channelId: string;
  readonly event: WebhookEvent;
  readonly status: 'success' | 'failed';
  readonly statusCode?: number;
  readonly error?: string;
  readonly deliveredAt: string;
  readonly durationMs: number;
}

// ─── SSRF guard ─────────────────────────────────────────────────────────────

/**
 * Allow webhook delivery only to public https endpoints.
 *
 * SECURITY: the delivery path does `fetch(channel.url)`. Without this guard an
 * operator — or any future API that lets a tenant register a channel — could
 * point a webhook at an internal service or the cloud metadata endpoint
 * (169.254.169.254) and turn outbound delivery into SSRF (credential theft,
 * internal port scanning). Private, loopback, link-local and unique-local
 * destinations are rejected by hostname inspection; non-https is rejected.
 */
export function isSafeWebhookUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }
  // IPv6 loopback (::1), unique-local (fc00::/7 → fc/fd) and link-local (fe80::).
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return false;
  }
  // IPv4 literal private / reserved ranges.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return false;       // this-net, private, loopback
    if (a === 169 && b === 254) return false;                 // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return false;        // 172.16.0.0/12
    if (a === 192 && b === 168) return false;                 // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return false;       // CGNAT 100.64.0.0/10
    if (a >= 224) return false;                               // multicast / reserved
  }
  return true;
}

// ─── Channel Registry (in-memory, loaded from DB at startup) ────────────────

const channels = new Map<string, WebhookChannel>();

export function registerChannel(channel: WebhookChannel): void {
  if (!isSafeWebhookUrl(channel.url)) {
    log.warn(
      `Refusing to register webhook channel ${channel.name}: URL is not a public https endpoint`
    );
    return;
  }
  channels.set(channel.id, channel);
  log.info(`Registered webhook channel: ${channel.name} (${channel.platform})`);
}

export function removeChannel(channelId: string): void {
  channels.delete(channelId);
}

export function getChannels(organizationId: number): WebhookChannel[] {
  return [...channels.values()].filter(c => c.organizationId === organizationId);
}

export function getChannel(channelId: string): WebhookChannel | undefined {
  return channels.get(channelId);
}

// ─── Payload Builders ───────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<EventSeverity, string> = {
  critical: ':rotating_light:',
  high: ':warning:',
  medium: ':large_blue_circle:',
  low: ':white_circle:',
  info: ':information_source:',
};

const SEVERITY_COLOR: Record<EventSeverity, string> = {
  critical: '#DC2626',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: '#6B7280',
  info: '#8B5CF6',
};

function buildSlackPayload(event: WebhookEvent): Record<string, unknown> {
  const emoji = SEVERITY_EMOJI[event.severity];
  const color = SEVERITY_COLOR[event.severity];

  const fields: Array<{ title: string; value: string; short: boolean }> = [];
  if (event.projectName) fields.push({ title: 'Project', value: event.projectName, short: true });
  if (event.artifactName) fields.push({ title: 'Document', value: event.artifactName, short: true });
  if (event.sectionCode) fields.push({ title: 'Section', value: event.sectionCode, short: true });
  if (event.actor) fields.push({ title: 'Triggered by', value: event.actor, short: true });

  if (event.details) {
    for (const [key, val] of Object.entries(event.details)) {
      fields.push({ title: key, value: String(val), short: true });
    }
  }

  return {
    attachments: [{
      color,
      pretext: `${emoji} *${event.title}*`,
      text: event.summary,
      fields,
      footer: 'Concept2Cure Automation',
      ts: Math.floor(new Date(event.timestamp).getTime() / 1000),
      ...(event.link ? { actions: [{ type: 'button', text: 'View', url: event.link }] } : {}),
    }],
  };
}

function buildTeamsPayload(event: WebhookEvent): Record<string, unknown> {
  const color = SEVERITY_COLOR[event.severity];

  const facts: Array<{ name: string; value: string }> = [];
  if (event.projectName) facts.push({ name: 'Project', value: event.projectName });
  if (event.artifactName) facts.push({ name: 'Document', value: event.artifactName });
  if (event.sectionCode) facts.push({ name: 'Section', value: event.sectionCode });
  if (event.actor) facts.push({ name: 'Triggered by', value: event.actor });

  if (event.details) {
    for (const [key, val] of Object.entries(event.details)) {
      facts.push({ name: key, value: String(val) });
    }
  }

  const card: Record<string, unknown> = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    themeColor: color.replace('#', ''),
    summary: event.title,
    sections: [{
      activityTitle: event.title,
      activitySubtitle: `Severity: ${event.severity} | ${event.timestamp}`,
      text: event.summary,
      facts,
    }],
  };

  if (event.link) {
    card.potentialAction = [{
      '@type': 'OpenUri',
      name: 'View in Concept2Cure',
      targets: [{ os: 'default', uri: event.link }],
    }];
  }

  return card;
}

function buildGenericPayload(event: WebhookEvent): Record<string, unknown> {
  return {
    event_type: event.type,
    severity: event.severity,
    title: event.title,
    summary: event.summary,
    project: event.projectName,
    artifact: event.artifactName,
    section: event.sectionCode,
    actor: event.actor,
    details: event.details || {},
    timestamp: event.timestamp,
    link: event.link,
    source: 'concept2cure',
  };
}

// ─── Delivery ───────────────────────────────────────────────────────────────

const DELIVERY_TIMEOUT_MS = 10_000;

async function deliverToChannel(channel: WebhookChannel, event: WebhookEvent): Promise<WebhookDelivery> {
  const start = Date.now();

  // SECURITY: re-validate at the delivery sink (defense in depth — a channel
  // could have been mutated after registration). Never fetch a non-public URL.
  if (!isSafeWebhookUrl(channel.url)) {
    return {
      channelId: channel.id,
      event,
      status: 'failed',
      error: 'Refused: webhook URL is not a public https endpoint',
      deliveredAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  let payload: Record<string, unknown>;
  switch (channel.platform) {
    case 'slack':
      payload = buildSlackPayload(event);
      break;
    case 'teams':
      payload = buildTeamsPayload(event);
      break;
    default:
      payload = buildGenericPayload(event);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const response = await fetch(channel.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - start;

    if (response.ok) {
      log.info(`Delivered to ${channel.name} (${channel.platform}) in ${durationMs}ms`);
      return {
        channelId: channel.id,
        event,
        status: 'success',
        statusCode: response.status,
        deliveredAt: new Date().toISOString(),
        durationMs,
      };
    }

    const errorBody = await response.text().catch(() => '');
    log.warn(`Webhook delivery failed to ${channel.name}: ${response.status} ${errorBody}`);
    return {
      channelId: channel.id,
      event,
      status: 'failed',
      statusCode: response.status,
      error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
      deliveredAt: new Date().toISOString(),
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Webhook delivery error to ${channel.name}: ${message}`);
    return {
      channelId: channel.id,
      event,
      status: 'failed',
      error: message,
      deliveredAt: new Date().toISOString(),
      durationMs,
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send an event notification to all matching webhook channels for an organization.
 * Non-blocking — failures are logged but never throw.
 */
export async function notifyWebhooks(
  organizationId: number,
  event: WebhookEvent,
): Promise<WebhookDelivery[]> {
  const orgChannels = getChannels(organizationId)
    .filter(c => c.enabled)
    .filter(c => c.events.length === 0 || c.events.includes(event.type) || c.events.includes('*'));

  if (orgChannels.length === 0) {
    log.info(`No webhook channels configured for org ${organizationId} — skipping notification`);
    return [];
  }

  const deliveries = await Promise.allSettled(
    orgChannels.map(channel => deliverToChannel(channel, event)),
  );

  return deliveries
    .filter((d): d is PromiseFulfilledResult<WebhookDelivery> => d.status === 'fulfilled')
    .map(d => d.value);
}

/**
 * Send a rewrite-dispatched notification.
 */
export async function notifyRewriteDispatched(
  organizationId: number,
  opts: {
    projectName: string;
    artifactName: string;
    sectionCode: string;
    strategy: string;
    changeSource: string;
    actor: string;
    jobCount: number;
    link?: string;
  },
): Promise<WebhookDelivery[]> {
  return notifyWebhooks(organizationId, {
    type: 'automation.rewrite.dispatched',
    severity: 'medium',
    title: `Auto-Rewrite Dispatched: ${opts.sectionCode}`,
    summary: `${opts.jobCount} section(s) queued for ${opts.strategy} due to ${opts.changeSource}`,
    projectName: opts.projectName,
    artifactName: opts.artifactName,
    sectionCode: opts.sectionCode,
    actor: opts.actor,
    details: { strategy: opts.strategy, source: opts.changeSource, jobs: opts.jobCount },
    timestamp: new Date().toISOString(),
    link: opts.link,
  });
}

/**
 * Send a rewrite-completed notification.
 */
export async function notifyRewriteCompleted(
  organizationId: number,
  opts: {
    projectName: string;
    artifactName: string;
    sectionCode: string;
    success: boolean;
    durationMs: number;
    link?: string;
  },
): Promise<WebhookDelivery[]> {
  return notifyWebhooks(organizationId, {
    type: opts.success ? 'automation.rewrite.completed' : 'automation.rewrite.failed',
    severity: opts.success ? 'info' : 'high',
    title: opts.success
      ? `Auto-Rewrite Complete: ${opts.sectionCode}`
      : `Auto-Rewrite Failed: ${opts.sectionCode}`,
    summary: opts.success
      ? `Section ${opts.sectionCode} rewritten successfully in ${opts.durationMs}ms`
      : `Auto-rewrite of ${opts.sectionCode} failed — manual review required`,
    projectName: opts.projectName,
    artifactName: opts.artifactName,
    sectionCode: opts.sectionCode,
    details: { success: opts.success, durationMs: opts.durationMs },
    timestamp: new Date().toISOString(),
    link: opts.link,
  });
}

/**
 * Send a data-change-detected notification.
 */
export async function notifyDataChange(
  organizationId: number,
  opts: {
    projectName: string;
    changeSource: string;
    sourceLabel: string;
    affectedSections: number;
    actor: string;
  },
): Promise<WebhookDelivery[]> {
  return notifyWebhooks(organizationId, {
    type: 'automation.data.changed',
    severity: opts.affectedSections > 5 ? 'high' : 'medium',
    title: `Data Change Detected: ${opts.sourceLabel}`,
    summary: `${opts.affectedSections} section(s) may need updating due to changes in ${opts.changeSource}`,
    projectName: opts.projectName,
    actor: opts.actor,
    details: { source: opts.changeSource, affectedSections: opts.affectedSections },
    timestamp: new Date().toISOString(),
  });
}

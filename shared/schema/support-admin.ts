/**
 * Support Administration Schema
 *
 * Tables for support ticket management, knowledge base articles,
 * support settings, and SLA tracking per organization.
 */
import {
  pgTable,
  pgEnum,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  json,
  unique,
  varchar,
  index,
} from 'drizzle-orm/pg-core';

// ============================================================
// ENUMS
// ============================================================

export const supportTicketStatusEnum = pgEnum('support_ticket_status', [
  'open',
  'in_progress',
  'waiting_on_customer',
  'waiting_on_internal',
  'escalated',
  'resolved',
  'closed',
]);

export const supportTicketPriorityEnum = pgEnum('support_ticket_priority', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const supportTicketCategoryEnum = pgEnum('support_ticket_category', [
  'general',
  'billing',
  'technical',
  'feature_request',
  'bug_report',
  'account',
  'compliance',
  'integration',
]);

export const supportArticleStatusEnum = pgEnum('support_article_status', [
  'draft',
  'published',
  'archived',
]);

// ============================================================
// SUPPORT TICKETS
// ============================================================

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    /** User who created the ticket */
    createdById: integer('created_by_id').notNull(),
    /** Agent/admin assigned to handle the ticket */
    assignedToId: integer('assigned_to_id'),
    ticketNumber: varchar('ticket_number', { length: 20 }).notNull().unique(),
    subject: varchar('subject', { length: 500 }).notNull(),
    description: text('description').notNull(),
    status: supportTicketStatusEnum('status').notNull().default('open'),
    priority: supportTicketPriorityEnum('priority').notNull().default('medium'),
    category: supportTicketCategoryEnum('category').notNull().default('general'),
    /** Tags for filtering/search */
    tags: json('tags').$type<string[]>().default([]),
    /** Internal notes not visible to customer */
    internalNotes: text('internal_notes'),
    /** SLA deadline for first response */
    slaResponseDue: timestamp('sla_response_due'),
    /** SLA deadline for resolution */
    slaResolutionDue: timestamp('sla_resolution_due'),
    /** When first response was sent */
    firstResponseAt: timestamp('first_response_at'),
    /** When the ticket was resolved */
    resolvedAt: timestamp('resolved_at'),
    /** When the ticket was closed */
    closedAt: timestamp('closed_at'),
    /** Customer satisfaction rating (1-5) */
    satisfactionRating: integer('satisfaction_rating'),
    satisfactionFeedback: text('satisfaction_feedback'),
    /** JSON metadata for extensibility */
    metadata: json('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_support_tickets_org').on(table.organizationId),
    index('idx_support_tickets_status').on(table.status),
    index('idx_support_tickets_assigned').on(table.assignedToId),
    index('idx_support_tickets_created_by').on(table.createdById),
    index('idx_support_tickets_priority').on(table.priority),
    index('idx_support_tickets_category').on(table.category),
  ]
);

// ============================================================
// SUPPORT TICKET MESSAGES (thread replies)
// ============================================================

export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id: serial('id').primaryKey(),
    ticketId: integer('ticket_id').notNull(),
    /** User who wrote this message */
    userId: integer('user_id').notNull(),
    /** Whether this is an internal note (not visible to customer) */
    isInternal: boolean('is_internal').notNull().default(false),
    content: text('content').notNull(),
    /** File attachments as JSON array */
    attachments: json('attachments').$type<Array<{ name: string; url: string; size: number }>>().default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_support_messages_ticket').on(table.ticketId),
  ]
);

// ============================================================
// KNOWLEDGE BASE ARTICLES
// ============================================================

export const supportArticles = pgTable(
  'support_articles',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    /** Author user ID */
    authorId: integer('author_id').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    /** URL-friendly slug */
    slug: varchar('slug', { length: 500 }).notNull(),
    /** Article body (markdown) */
    content: text('content').notNull(),
    /** Short summary for search results */
    excerpt: text('excerpt'),
    category: varchar('category', { length: 100 }).notNull().default('general'),
    tags: json('tags').$type<string[]>().default([]),
    status: supportArticleStatusEnum('status').notNull().default('draft'),
    /** Whether this is visible to all orgs (platform-wide) */
    isGlobal: boolean('is_global').notNull().default(false),
    /** Sort/display order within category */
    sortOrder: integer('sort_order').notNull().default(0),
    /** View count for analytics */
    viewCount: integer('view_count').notNull().default(0),
    /** Helpfulness upvotes */
    helpfulCount: integer('helpful_count').notNull().default(0),
    /** Helpfulness downvotes */
    notHelpfulCount: integer('not_helpful_count').notNull().default(0),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_support_articles_org').on(table.organizationId),
    index('idx_support_articles_status').on(table.status),
    index('idx_support_articles_category').on(table.category),
    unique('uq_support_articles_org_slug').on(table.organizationId, table.slug),
  ]
);

// ============================================================
// SUPPORT SETTINGS (per-organization)
// ============================================================

export const supportSettings = pgTable('support_settings', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().unique(),
  /** Auto-assign tickets to admins round-robin */
  autoAssignEnabled: boolean('auto_assign_enabled').notNull().default(false),
  /** Default SLA response time in hours */
  slaResponseHours: integer('sla_response_hours').notNull().default(24),
  /** Default SLA resolution time in hours */
  slaResolutionHours: integer('sla_resolution_hours').notNull().default(72),
  /** Email notifications for new tickets */
  notifyOnNewTicket: boolean('notify_on_new_ticket').notNull().default(true),
  /** Email notifications for ticket updates */
  notifyOnTicketUpdate: boolean('notify_on_ticket_update').notNull().default(true),
  /** Custom categories enabled for this org */
  customCategories: json('custom_categories').$type<string[]>().default([]),
  /** Business hours for SLA calculation (JSON) */
  businessHours: json('business_hours').$type<{
    timezone: string;
    schedule: Record<string, { start: string; end: string } | null>;
  }>(),
  /** Escalation rules (JSON) */
  escalationRules: json('escalation_rules').$type<Array<{
    conditionField: string;
    conditionValue: string;
    action: string;
    targetUserId?: number;
  }>>().default([]),
  /** Satisfaction survey enabled */
  satisfactionSurveyEnabled: boolean('satisfaction_survey_enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================
// TYPE EXPORTS
// ============================================================

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type NewSupportTicketMessage = typeof supportTicketMessages.$inferInsert;
export type SupportArticle = typeof supportArticles.$inferSelect;
export type NewSupportArticle = typeof supportArticles.$inferInsert;
export type SupportSettings = typeof supportSettings.$inferSelect;
export type NewSupportSettings = typeof supportSettings.$inferInsert;

export const SUPPORT_ADMIN_TABLES = {
  supportTickets,
  supportTicketMessages,
  supportArticles,
  supportSettings,
} as const;

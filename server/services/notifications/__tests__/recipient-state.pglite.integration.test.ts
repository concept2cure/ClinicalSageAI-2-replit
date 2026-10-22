import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: state.query } }));
import { listNotifications, markRead, markAllRead, archive, unreadCount } from '../notification-service';

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text, persona text);
    CREATE TABLE mdx_notifications (
      id serial PRIMARY KEY, organization_id integer NOT NULL, recipient_user_id integer,
      recipient_role text, category text, severity text, title text, body text,
      resource_type text, resource_id text, action_url text, metadata jsonb,
      read_at timestamptz, archived_at timestamptz, expires_at timestamptz,
      created_at timestamptz DEFAULT now());
    CREATE TABLE mdx_notification_receipts (
      organization_id integer NOT NULL, notification_id integer NOT NULL,
      user_id integer NOT NULL, read_at timestamptz, archived_at timestamptz,
      PRIMARY KEY (organization_id, notification_id, user_id));
    CREATE TABLE mdx_notification_subscriptions (
      organization_id integer NOT NULL, user_id integer NOT NULL, category text,
      in_app_enabled boolean DEFAULT true, email_enabled boolean DEFAULT false,
      push_enabled boolean DEFAULT false);
  `);
  state.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  });
}, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`
    TRUNCATE mdx_notification_receipts, mdx_notification_subscriptions, mdx_notifications RESTART IDENTITY;
    TRUNCATE organization_users;
    INSERT INTO organization_users VALUES (7,1,'approver',null),(7,2,'viewer',null),(7,3,'approver',null),(8,4,'approver',null);
    INSERT INTO mdx_notifications (organization_id,recipient_role,category,severity,title)
      VALUES (7,'approver','admin','info','For approvers'),(7,null,'admin','info','For all members'),(8,null,'admin','info','Other tenant');
  `);
});

describe('notification audience and recipient-specific receipts', () => {
  it('does not disclose role notifications to another organization role', async () => {
    expect((await listNotifications(7, { recipientUserId: 2 })).map(n => n.title)).toEqual(['For all members']);
    expect((await listNotifications(7, { recipientUserId: 1 })).map(n => n.title).sort()).toEqual(['For all members','For approvers']);
  });
  it('requires a live membership, not just an organization number', async () => {
    expect(await listNotifications(7, { recipientUserId: 4 })).toEqual([]);
    expect(await unreadCount(7,4)).toBe(0);
  });
  it('binds category and severity filters as data while preserving audience and limit', async () => {
    expect(await listNotifications(7, { recipientUserId: 1, category: "admin' OR true --" })).toEqual([]);
    expect(await listNotifications(7, { recipientUserId: 1, severity: "info' OR true --" as 'info' })).toEqual([]);
    expect(await listNotifications(7, { recipientUserId: 1, category: 'admin', severity: 'info', limit: 1 })).toHaveLength(1);
    const [statement, params] = state.query.mock.calls.at(-1)!;
    expect(statement).toContain('LIMIT $6');
    expect(statement).not.toContain("admin' OR true");
    expect(params).toEqual([7, 1, false, 'admin', 'info', 1]);
  });
  it('a role notification cannot be marked read by a nonrecipient', async () => {
    expect(await markRead(7,1,2)).toBe(false);
  });
  it('one person reading a team notice does not clear another recipient tray', async () => {
    expect(await markRead(7,1,1)).toBe(true);
    expect(await unreadCount(7,1)).toBe(1);
    expect(await unreadCount(7,3)).toBe(2);
    expect((await listNotifications(7,{recipientUserId:3,unreadOnly:true})).map(n=>n.id)).toContain(1);
  });
  it('mark all read changes only the current recipient receipts', async () => {
    expect(await markAllRead(7,1)).toBe(2);
    expect(await unreadCount(7,1)).toBe(0);
    expect(await unreadCount(7,3)).toBe(2);
    expect(await markAllRead(7,1)).toBe(0);
  });
  it('archiving an org notice is private to the archiving recipient', async () => {
    expect(await archive(7,2,1)).toBe(true);
    expect((await listNotifications(7,{recipientUserId:1})).map(n=>n.id)).not.toContain(2);
    expect((await listNotifications(7,{recipientUserId:3})).map(n=>n.id)).toContain(2);
  });
  it('honors the actual recipient in-app category preference', async () => {
    await db.exec("INSERT INTO mdx_notification_subscriptions (organization_id,user_id,category,in_app_enabled) VALUES (7,1,'admin',false)");
    expect(await listNotifications(7,{recipientUserId:1})).toEqual([]);
    expect(await unreadCount(7,1)).toBe(0);
    expect(await unreadCount(7,3)).toBe(2);
  });
});

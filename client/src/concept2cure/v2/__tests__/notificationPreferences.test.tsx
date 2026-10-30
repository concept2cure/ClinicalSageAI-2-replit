// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { NotificationPreferences } from '../NotificationPreferences';
import { setAuthToken } from '@/utils/authToken';
const scope = { userId: '33', organizationId: '1' };
const headers = { Authorization: 'Bearer header.' + btoa(JSON.stringify({ userId: 33, organizationId: 1 })) + '.test', 'x-organization-id': '1' };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data, meta: { channels: { inApp: true, email: false, push: false } } }) });
beforeEach(() => { apiRequest.mockReset(); setAuthToken(headers.Authorization.slice(7)); });
afterEach(cleanup);
it.each([
  ['task_update','Task updates and reminders'],
  ['schedule_milestone_slip','Slipped milestones'],
])('persists the actual %s producer preference from its labelled mounted control',async(category,label)=>{
  let enabled=true;
  apiRequest.mockImplementation(async(method,_path,body)=>{
    if(method==='PUT'){ enabled=body.inAppEnabled; return ok({ organization_id: 1, user_id: 33, category, in_app_enabled: enabled }); }
    return ok([{category,in_app_enabled:enabled}]);
  });
  const onSaved=vi.fn();render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={onSaved}/>);
  const control=await screen.findByRole('checkbox',{name:label});
  expect((control as HTMLInputElement).checked).toBe(true);fireEvent.click(control);
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('PUT',`/api/mdx/notification-subscriptions/${category}`,{inAppEnabled:false},headers));
  await waitFor(()=>expect((control as HTMLInputElement).checked).toBe(false));
  expect(onSaved).toHaveBeenCalledOnce();
});
it('persists a category preference and re-reads the saved value without enabling external channels', async () => {
  let enabled = true;
  apiRequest.mockImplementation(async (method, _path, body) => {
    if (method === 'PUT') { enabled = body.inAppEnabled; return ok({ organization_id: 1, user_id: 33, category: 'submission_status', in_app_enabled: enabled }); }
    return ok([{ category: 'submission_status', in_app_enabled: enabled }]);
  });
  const onSaved = vi.fn();
  render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={onSaved} />);
  const checkbox = await screen.findByRole('checkbox', { name: 'Submission status' });
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  fireEvent.click(checkbox);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/mdx/notification-subscriptions/submission_status', { inAppEnabled: false }, headers));
  await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(false));
  expect(onSaved).toHaveBeenCalledOnce();
  expect(screen.getByText(/Email and push alerts are not available/)).toBeTruthy();
});
it('keeps the saved preference visible when a write fails', async () => {
  apiRequest.mockImplementation(async method => method === 'PUT' ? { ok: false, status: 500, json: async () => ({ message: 'Preference save unavailable.' }) } : ok([]));
  const onSaved = vi.fn();
  render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={onSaved} />);
  const checkbox = await screen.findByRole('checkbox', { name: 'Submission status' });
  fireEvent.click(checkbox);
  await screen.findByRole('alert');
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect(onSaved).not.toHaveBeenCalled();
});
it('a failed preference read never presents assumed defaults as saved settings', async () => {
  apiRequest.mockRejectedValue(new Error('Unavailable'));
  render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByRole('alert');
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});
it('rejects a malformed successful preference response instead of displaying default settings', async () => {
  apiRequest.mockResolvedValue(ok({ unexpected: true }));
  render(<NotificationPreferences scope={scope} onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByRole('alert');
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
});

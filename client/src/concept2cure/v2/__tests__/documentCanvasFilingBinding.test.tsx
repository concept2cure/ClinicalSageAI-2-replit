// @vitest-environment jsdom
/**
 * The canvas hands the workbench the filing its document is the editing copy
 * of (FILING_SPINE F4). The outline offers "start this section" only in that
 * copy, and reads "binding not known" (no start) when the field is absent — so
 * a canvas that drops `c2c_document_id` would silently take the start away
 * from the one document where it belongs.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const seen = vi.hoisted(() => ({ docs: null as unknown }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../editor/DocumentWorkbench', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/DocumentWorkbench')>()),
  DocumentWorkbench: (props: { docs: unknown }) => {
    seen.docs = props.docs;
    return <div data-testid="workbench-stub" />;
  },
}));

import { DocumentCanvas } from '../editor/DocumentCanvas';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

function mockApi(binding: string | null) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}`) {
      return ok({
        success: true,
        document: {
          id: DOC, title: 'IND Module 2', module: 'M2', product_code: null, status: 'DRAFT',
          updated_at: null, section_count: 0, c2c_document_id: binding,
        },
      });
    }
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: [] });
    return ok({ success: true });
  });
}

function Host() {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <DocumentCanvas
      docId={DOC}
      programId={PID}
      conversationId="thread-1"
      fromThisConversation
      draftTitle="IND Module 2"
      expanded={expanded}
      onExpandedChange={setExpanded}
      onNav={() => undefined}
      onAsk={() => undefined}
      fireToast={() => undefined}
    />
  );
}

beforeEach(() => { seen.docs = null; });
afterEach(cleanup);

describe('DocumentCanvas carries the filing binding into the workbench', () => {
  it.each([['doc_ind_33333333'], [null]])('c2c_document_id = %s reaches the workbench as read', async (binding) => {
    mockApi(binding);
    render(<Host />);
    await screen.findByText('IND Module 2');
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    await screen.findByTestId('workbench-stub');
    await waitFor(() => expect(seen.docs).not.toBeNull());
    expect((seen.docs as Array<{ id: string; c2c_document_id?: string | null }>)[0]).toMatchObject({
      id: DOC,
      c2c_document_id: binding,
    });
  });
});

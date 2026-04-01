// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ConnectedProjectSwitcher } from '../ConnectedProjectSwitcher';

const mockProjectSwitcher = vi.fn(() => null);

vi.mock('../ProjectSwitcher', () => ({
  ProjectSwitcher: (props: any) => {
    mockProjectSwitcher(props);
    return null;
  },
}));

vi.mock('../../../hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [
      {
        id: 'p-1',
        name: 'Program Atlas',
        submissionType: 'IND',
        description: 'desc',
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        conversations: [],
        starred: false,
        archived: false,
      },
    ],
    isLoading: true,
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}));

describe('ConnectedProjectSwitcher', () => {
  it('passes loading state and transformed projects into ProjectSwitcher', () => {
    render(
      React.createElement(ConnectedProjectSwitcher, {
        isOpen: true,
        onClose: vi.fn(),
        onSelectProject: vi.fn(),
        onOpenNewProjectModal: vi.fn(),
      })
    );

    expect(mockProjectSwitcher).toHaveBeenCalled();
    const props = mockProjectSwitcher.mock.calls[0][0];
    expect(props.isLoading).toBe(true);
    expect(props.projects[0].name).toBe('Program Atlas');
    expect(props.projects[0].type).toBe('IND');
  });
});


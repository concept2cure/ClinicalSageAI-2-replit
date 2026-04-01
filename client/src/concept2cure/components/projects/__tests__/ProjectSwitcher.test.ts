// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectSwitcher, NewProjectModal } from '../ProjectSwitcher';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('ProjectSwitcher', () => {
  const baseProjects = [
    {
      id: 'p-1',
      name: 'Alpha NDA',
      type: 'NDA',
      lastUpdated: new Date('2026-03-01T00:00:00.000Z'),
      conversationCount: 12,
      starred: true,
      archived: false,
    },
    {
      id: 'p-2',
      name: 'Beta IND',
      type: 'IND',
      lastUpdated: new Date('2026-03-10T00:00:00.000Z'),
      conversationCount: 8,
      archived: false,
    },
  ];

  it('lists projects and opens selected project', async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    const onClose = vi.fn();

    render(
      React.createElement(ProjectSwitcher, {
        isOpen: true,
        onClose,
        projects: baseProjects,
        activeProjectId: 'p-1',
        onSelectProject,
        onCreateProject: vi.fn(),
        onArchiveProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onToggleStar: vi.fn(),
      })
    );

    expect(screen.getByText('Alpha NDA')).toBeTruthy();
    expect(screen.getByText('Beta IND')).toBeTruthy();

    await user.click(screen.getByText('Beta IND'));
    expect(onSelectProject).toHaveBeenCalledWith('p-2');
    expect(onClose).toHaveBeenCalled();
  });

  it('filters project list using search', async () => {
    const user = userEvent.setup();
    render(
      React.createElement(ProjectSwitcher, {
        isOpen: true,
        onClose: vi.fn(),
        projects: baseProjects,
        onSelectProject: vi.fn(),
        onCreateProject: vi.fn(),
        onArchiveProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onToggleStar: vi.fn(),
      })
    );

    await user.type(screen.getByPlaceholderText('Search projects...'), 'beta');
    expect(screen.queryByText('Alpha NDA')).toBeNull();
    expect(screen.getByText('Beta IND')).toBeTruthy();
  });

  it('shows loading state for project load path', () => {
    render(
      React.createElement(ProjectSwitcher, {
        isOpen: true,
        onClose: vi.fn(),
        projects: [],
        isLoading: true,
        onSelectProject: vi.fn(),
        onCreateProject: vi.fn(),
        onArchiveProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onToggleStar: vi.fn(),
      })
    );

    expect(screen.getByText('Loading projects…')).toBeTruthy();
  });

  it('offers first-project creation CTA when list is empty', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    render(
      React.createElement(ProjectSwitcher, {
        isOpen: true,
        onClose: vi.fn(),
        projects: [],
        onSelectProject: vi.fn(),
        onCreateProject,
        onArchiveProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onToggleStar: vi.fn(),
      })
    );

    await user.click(screen.getByRole('button', { name: /create your first project/i }));
    expect(onCreateProject).toHaveBeenCalled();
  });
});

describe('NewProjectModal', () => {
  it('creates a project from modal form', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(React.createElement(NewProjectModal, { isOpen: true, onClose, onCreate }));

    await user.type(screen.getByPlaceholderText(/CardioFlow Heart Monitor/i), 'Program Atlas');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Program Atlas',
        type: '510K',
      })
    );
    expect(onClose).toHaveBeenCalled();
  });
});

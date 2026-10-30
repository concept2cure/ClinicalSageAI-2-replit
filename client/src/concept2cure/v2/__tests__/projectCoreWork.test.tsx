// @vitest-environment jsdom
/** Project initiation reaches existing work with one combined study/protocol choice. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { APP_REGISTRY } from '@shared/regulatory/app-registry';
import { ProjectCoreWork } from '../surfaces/ProjectCoreWork';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const OTHER = '9c9c9c9c-1111-4222-8333-444455556666';
const allow = () => true;
const select = () => screen.getByRole('combobox', { name: 'Core work' }) as HTMLSelectElement;
const start = () => screen.getByRole('button', { name: 'Start selected work' }) as HTMLButtonElement;
const options = () => within(select()).getAllByRole('option') as HTMLOptionElement[];

afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('core work selected inside a project', () => {
  it('offers one combined study/protocol choice alongside the existing peer destinations', () => {
    render(<ProjectCoreWork programId={PID} cmcComposes available={allow} onNav={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Start work in this project' })).toBeTruthy();
    expect(options().map(option => option.value)).toEqual(['', 'protocol-dev', 'cmc', 'rbm', 'biostatistics']);
    expect(within(select()).getAllByRole('option', { name: APP_REGISTRY.study_protocol_design.label })).toHaveLength(1);
    expect(within(select()).queryByRole('option', { name: /^Study design$/i })).toBeNull();
    expect(within(select()).queryByRole('option', { name: /^Protocol design$/i })).toBeNull();
    expect(select().value).toBe('');
    expect(start().disabled).toBe(true);
  });

  it.each(['protocol-dev', 'cmc', 'rbm', 'biostatistics'])(
    'opens the existing %s destination only after the person starts the selected work', destination => {
      const project = { id: PID, title: 'BX-410' };
      (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = project;
      const onNav = vi.fn();
      render(<ProjectCoreWork programId={PID} cmcComposes available={allow} onNav={onNav} />);
      fireEvent.change(select(), { target: { value: destination } });
      expect(onNav).not.toHaveBeenCalled();
      expect(start().disabled).toBe(false);
      fireEvent.click(start());
      expect(onNav).toHaveBeenCalledExactlyOnceWith(destination);
      expect((window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT).toBe(project);
    },
  );

  it('offers only destinations this person can open and offers no control when none are available', () => {
    const { rerender } = render(<ProjectCoreWork programId={PID} cmcComposes available={id => id === 'protocol-dev'} onNav={vi.fn()} />);
    expect(options().map(option => option.value)).toEqual(['', 'protocol-dev']);
    rerender(<ProjectCoreWork programId={PID} cmcComposes available={() => false} onNav={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Core work' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start selected work' })).toBeNull();
  });

  it('does not offer CMC outside its composition boundary even when the surface is available', () => {
    render(<ProjectCoreWork programId={PID} cmcComposes={false} available={allow} onNav={vi.fn()} />);
    expect(options().map(option => option.value)).toEqual(['', 'protocol-dev', 'rbm', 'biostatistics']);
  });

  it('refuses to launch a selected destination after its availability changes', () => {
    const onNav = vi.fn();
    const { rerender } = render(<ProjectCoreWork programId={PID} cmcComposes available={allow} onNav={onNav} />);
    fireEvent.change(select(), { target: { value: 'protocol-dev' } });
    rerender(<ProjectCoreWork programId={PID} cmcComposes available={id => id !== 'protocol-dev'} onNav={onNav} />);
    expect(start().disabled).toBe(true);
    fireEvent.click(start());
    expect(onNav).not.toHaveBeenCalled();
  });

  it('refuses to launch previously selected CMC after the project facts cease to support composition', () => {
    const onNav = vi.fn();
    const { rerender } = render(<ProjectCoreWork programId={PID} cmcComposes available={allow} onNav={onNav} />);
    fireEvent.change(select(), { target: { value: 'cmc' } });
    rerender(<ProjectCoreWork programId={PID} cmcComposes={false} available={allow} onNav={onNav} />);
    expect(start().disabled).toBe(true);
    fireEvent.click(start());
    expect(onNav).not.toHaveBeenCalled();
  });

  it('requires a new selection when the open project changes', () => {
    const onNav = vi.fn();
    const { rerender } = render(<ProjectCoreWork programId={PID} cmcComposes available={allow} onNav={onNav} />);
    fireEvent.change(select(), { target: { value: 'protocol-dev' } });
    rerender(<ProjectCoreWork programId={OTHER} cmcComposes available={allow} onNav={onNav} />);
    expect(select().value).toBe('');
    expect(start().disabled).toBe(true);
    fireEvent.click(start());
    expect(onNav).not.toHaveBeenCalled();
  });
});

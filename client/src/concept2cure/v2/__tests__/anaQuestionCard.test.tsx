// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { OTHER_POSITION, otherFieldId, type IntelligenceQuestionEvent } from '@shared/types/intelligence-questions';

import { AnaQuestionCard } from '../AnaQuestionCard';

/**
 * AnA's question reaches the person as positions they can take, and one they
 * can write themselves (founder's directive, 2026-10-12).
 *
 * The interview engine has resolved a question per node since the flows
 * landed — the pathway, the predicate strategy, the conformity route — and
 * emitted it over the stream. `useAnaChat` stored it on the message and
 * nothing drew it, so the person saw prose and typed an answer back. This
 * draws it, and holds three things: a position says what it commits the
 * programme to before it is picked; a position the list does not hold is
 * taken in the person's own words and cannot be submitted empty; and the
 * answer goes back in the shape the engine already accepts.
 */
afterEach(cleanup);

const QUESTION: IntelligenceQuestionEvent = {
  flowId: 'device-510k-v1',
  flowName: '510(k) submission',
  flowCategory: 'device_510k' as IntelligenceQuestionEvent['flowCategory'],
  node: {
    id: 'pathway',
    section: 'Regulatory strategy',
    question: 'Which pathway are you taking for this device?',
    guidance: 'The pathway decides what evidence you owe and whose data you may rely on.',
    fields: [
      {
        id: 'route',
        label: 'Pathway',
        type: 'select',
        required: true,
        options: [
          {
            value: 'traditional_510k',
            label: 'Traditional 510(k)',
            commits: 'Substantial equivalence to a predicate you name, on your own bench and clinical data.',
            authority: '21 CFR 807.87',
          },
          {
            value: 'de_novo',
            label: 'De Novo',
            commits: 'No predicate: you are asking FDA to classify the device, with controls you propose.',
            authority: '21 CFR 860.200',
          },
        ],
        allowOther: { prompt: 'Which pathway, in your own words?' },
      },
    ],
    defaultNext: null,
  },
  progress: { currentSection: 'Regulatory strategy', completedNodes: 2, totalNodes: 9, sections: [] },
  isFirst: false,
  isLast: false,
};

const renderCard = (onAnswer = vi.fn()) => {
  render(<AnaQuestionCard question={QUESTION} sessionId="sess-1" onAnswer={onAnswer} />);
  return onAnswer;
};

describe('the positions AnA offers', () => {
  it('says what each one commits the programme to, and what makes it a position', () => {
    renderCard();
    expect(screen.getByText('Traditional 510(k)')).toBeTruthy();
    expect(screen.getByText(/Substantial equivalence to a predicate you name/)).toBeTruthy();
    expect(screen.getByText('21 CFR 807.87')).toBeTruthy();
    expect(screen.getByText(/you are asking FDA to classify the device/)).toBeTruthy();
    expect(screen.getByText('21 CFR 860.200')).toBeTruthy();
  });

  it('asks the question and the progress through the interview', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: /Which pathway are you taking/ })).toBeTruthy();
    expect(screen.getByText('2 of 9')).toBeTruthy();
  });

  it('sends the chosen position in the shape the engine accepts', () => {
    const onAnswer = renderCard();
    fireEvent.click(screen.getByRole('radio', { name: /Traditional 510\(k\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAnswer).toHaveBeenCalledWith({ node_id: 'pathway', answers: { route: 'traditional_510k' }, session_id: 'sess-1' });
  });
});

describe('a position the list does not hold', () => {
  it('is offered, and says AnA will not treat it as one of hers', () => {
    renderCard();
    const own = screen.getByRole('radio', { name: /Something else/ });
    expect(own).toBeTruthy();
    expect(screen.getByText(/does not treat it as one of the positions above/)).toBeTruthy();
  });

  it('opens a box for the person’s own words, and will not be sent empty', () => {
    const onAnswer = renderCard();
    fireEvent.click(screen.getByRole('radio', { name: /Something else/ }));
    const box = screen.getByLabelText('Which pathway, in your own words?');
    expect(box).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(submit.disabled, 'an unexplained "something else" is not an answer').toBe(true);
    fireEvent.click(submit);
    expect(onAnswer).not.toHaveBeenCalled();
    /* And not by the other way a form is submitted: Enter in the box. The
       disabled button hides that path, so it is exercised directly. */
    fireEvent.submit(box.closest('form')!);
    expect(onAnswer).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: '513(g) request first, then decide' } });
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAnswer).toHaveBeenCalledWith({
      node_id: 'pathway',
      answers: { route: OTHER_POSITION, [otherFieldId('route')]: '513(g) request first, then decide' },
      session_id: 'sess-1',
    });
  });
});

describe('a question whose list is closed', () => {
  it('offers no escape hatch at all', () => {
    const closed: IntelligenceQuestionEvent = {
      ...QUESTION,
      node: {
        ...QUESTION.node,
        fields: [{ ...QUESTION.node.fields[0], allowOther: undefined }],
      },
    };
    render(<AnaQuestionCard question={closed} onAnswer={vi.fn()} />);
    expect(screen.queryByRole('radio', { name: /Something else/ })).toBeNull();
  });
});

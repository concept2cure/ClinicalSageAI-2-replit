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

/**
 * A position the programme's own answers contradict (founder's decision,
 * 2026-10-12). The card draws the caution and keeps the row: the alternative
 * — dropping the option — is the question lying by omission, and the person
 * may have reasons the interview has not been told.
 */
const CAUTIONED: IntelligenceQuestionEvent = {
  ...QUESTION,
  node: {
    ...QUESTION.node,
    fields: [
      {
        ...QUESTION.node.fields[0],
        options: [
          QUESTION.node.fields[0].options![0],
          {
            ...QUESTION.node.fields[0].options![1],
            caution: {
              availability: 'needs_basis',
              reason: 'You have named a predicate (K123456), so taking this position means saying why it does not apply.',
              authority: 'FD&C Act 513(f)(2); 21 CFR 860 Subpart D',
              ruleId: 'de_novo_with_named_predicate',
            },
          },
        ],
      },
    ],
  },
};

describe('a position the answers contradict', () => {
  it('is still offered, and says what contradicts it and on whose authority', () => {
    render(<AnaQuestionCard question={CAUTIONED} sessionId="sess-1" onAnswer={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /De Novo/ }), 'a cautioned position is marked, not removed').toBeTruthy();
    expect(screen.getByText(/This position needs a basis/)).toBeTruthy();
    expect(screen.getByText(/so taking this position means saying why it does not apply/)).toBeTruthy();
    expect(screen.getByText('FD&C Act 513(f)(2); 21 CFR 860 Subpart D')).toBeTruthy();
  });

  it('can be taken, and says AnA records the basis once it is', () => {
    const onAnswer = vi.fn();
    render(<AnaQuestionCard question={CAUTIONED} sessionId="sess-1" onAnswer={onAnswer} />);
    expect(screen.queryByText(/records the basis you take it on/), 'not a warning until it is chosen').toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /De Novo/ }));
    expect(screen.getByText(/records the basis you take it on/)).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(submit.disabled, 'a caution is not a refusal').toBe(false);
    fireEvent.click(submit);
    expect(onAnswer).toHaveBeenCalledWith({ node_id: 'pathway', answers: { route: 'de_novo' }, session_id: 'sess-1' });
  });

  it('leaves the positions nothing speaks against unmarked', () => {
    render(<AnaQuestionCard question={CAUTIONED} sessionId="sess-1" onAnswer={vi.fn()} />);
    expect(screen.queryAllByText(/needs a basis|contradict/)).toHaveLength(1);
  });
});

/**
 * The agency question (founder's directive, 2026-10-12). `agency_select` is a
 * field type the engine has always declared and no renderer ever implemented,
 * so it fell through to a text input: the answer that decides the Module 1
 * backbone, the validation profile and the gateway was typed prose.
 */
describe('a question whose type the card never implemented', () => {
  const agencyQuestion = (fields: IntelligenceQuestionEvent['node']['fields']): IntelligenceQuestionEvent => ({
    ...QUESTION,
    node: { ...QUESTION.node, question: 'Which agency is this project filing with?', fields },
  });

  it('draws an agency as positions, with what filing there commits the programme to', () => {
    const onAnswer = vi.fn();
    render(
      <AnaQuestionCard
        question={agencyQuestion([
          {
            id: 'primary_regulatory_agency',
            label: 'Primary Regulatory Agency',
            type: 'agency_select',
            required: true,
            options: [
              { value: 'US', label: 'FDA — United States', commits: 'Food and Drug Administration. Submissions are eCTD.' },
              { value: 'SG', label: 'HSA — Singapore', commits: 'Health Sciences Authority. AnA holds no Module 1 checklist for this agency.' },
            ],
            allowOther: { prompt: 'Which agency, in your own words?' },
          },
        ])}
        sessionId="sess-1"
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByRole('radio', { name: /FDA — United States/ }), 'an agency is picked, not typed').toBeTruthy();
    expect(screen.getByText(/AnA holds no Module 1 checklist for this agency/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /HSA — Singapore/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAnswer).toHaveBeenCalledWith({
      node_id: 'pathway',
      answers: { primary_regulatory_agency: 'SG' },
      session_id: 'sess-1',
    });
  });

  it('still draws an input where the question carries no positions, as country does today', () => {
    render(
      <AnaQuestionCard
        question={agencyQuestion([
          { id: 'headquarters_country', label: 'Headquarters Country', type: 'country_select', required: true },
        ])}
        sessionId="sess-1"
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect((screen.getByRole('textbox') as HTMLInputElement).id).toBe('ana-q-headquarters_country');
  });
});

/**
 * A question whose governed catalogue holds nothing for this programme: AnA
 * holds no routes to market for PMDA, so the engine sends the question with no
 * positions, the reason in its help text, and the escape hatch (2026-10-12).
 * An empty select would be an error drawn as a result.
 */
describe('a question with no positions and the reason in their place', () => {
  const noPositions: IntelligenceQuestionEvent = {
    ...QUESTION,
    node: {
      ...QUESTION.node,
      fields: [
        {
          id: 'device_submission_pathway',
          label: 'Submission Pathway',
          type: 'select',
          required: true,
          helpText: 'AnA holds no routes to market for PMDA — describe the route and she will record it in your words.',
          allowOther: { prompt: 'Which route are you taking, in your own words?' },
        },
      ],
    },
  };

  it('draws the reason and the box for their own words, and no empty list', () => {
    render(<AnaQuestionCard question={noPositions} sessionId="sess-1" onAnswer={vi.fn()} />);
    expect(screen.getByText(/holds no routes to market for PMDA/)).toBeTruthy();
    expect(screen.queryAllByRole('radio'), 'nothing to pick, so nothing is drawn as pickable').toHaveLength(0);
    expect(screen.getByLabelText('Which route are you taking, in your own words?')).toBeTruthy();
  });

  it('records the answer as the person’s own words, not as a position AnA offered', () => {
    const onAnswer = vi.fn();
    render(<AnaQuestionCard question={noPositions} sessionId="sess-1" onAnswer={onAnswer} />);
    const submit = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(submit.disabled, 'an empty answer is still no answer').toBe(true);
    fireEvent.change(screen.getByLabelText('Which route are you taking, in your own words?'), {
      target: { value: 'Shonin application via a Japanese marketing authorisation holder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAnswer).toHaveBeenCalledWith({
      node_id: 'pathway',
      answers: {
        device_submission_pathway: OTHER_POSITION,
        [otherFieldId('device_submission_pathway')]: 'Shonin application via a Japanese marketing authorisation holder',
      },
      session_id: 'sess-1',
    });
  });
});

/**
 * A field gated on an answer in its OWN question (2026-10-12 review).
 *
 * The server decides every gate an earlier question answered. It cannot decide
 * one that depends on an answer the person has not given yet, so it sends the
 * field with its predicate and the card decides it live. Before this, such a
 * field was dropped at draw time and demanded at validation — an unanswerable
 * question — and `additional_agencies`, gated on a yes/no in its own node, was
 * never drawn at all.
 */
describe('a field gated on an answer in the same question', () => {
  const gated: IntelligenceQuestionEvent = {
    ...QUESTION,
    node: {
      ...QUESTION.node,
      fields: [
        {
          id: 'multi_country_submission',
          label: 'Is this a multi-country submission?',
          type: 'yes_no',
          required: true,
        },
        {
          id: 'additional_agencies',
          label: 'Additional Regulatory Agencies',
          type: 'multi_select',
          required: true,
          visibleWhen: { field: 'multi_country_submission', operator: 'eq', value: true },
          options: [
            { value: 'EU', label: 'EMA — European Union' },
            { value: 'JP', label: 'PMDA — Japan' },
          ],
        },
      ],
    },
  };

  it('is not drawn until the answer it depends on is given', () => {
    render(<AnaQuestionCard question={gated} sessionId="sess-1" onAnswer={vi.fn()} />);
    expect(screen.queryByText('Additional Regulatory Agencies')).toBeNull();
  });

  it('appears the moment it applies, and is not required while it is hidden', () => {
    const onAnswer = vi.fn();
    render(<AnaQuestionCard question={gated} sessionId="sess-1" onAnswer={onAnswer} />);
    /* Hidden and required: the submit must not be blocked by a question the
       person cannot see. */
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(screen.getByText('Additional Regulatory Agencies')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled,
      'now it applies, so it is required',
    ).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: /PMDA/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAnswer).toHaveBeenCalledWith({
      node_id: 'pathway',
      answers: { multi_country_submission: 'yes', additional_agencies: ['JP'] },
      session_id: 'sess-1',
    });
  });
});

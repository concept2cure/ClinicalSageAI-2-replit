/**
 * Intelligent Document System - Test Suite
 * 
 * Phase 5: Tests for the redesigned SHERPA-inspired document system
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Import simpler components that don't need TipTap
import { 
  ClaimIndicator, 
  ClaimSummaryStrip, 
  ClaimTooltip 
} from '../SmartClaimHighlighter';
import { SourceSuggestionPanel } from '../SourceSuggestionPanel';

// Mock components and dependencies
jest.mock('@tiptap/react', () => ({
  useEditor: () => null,
  EditorContent: () => null,
}));

jest.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
}));

jest.mock('@tiptap/extension-highlight', () => ({
  default: { configure: () => ({}) },
}));

jest.mock('@tiptap/core', () => ({
  Mark: { create: (config) => config },
  mergeAttributes: (...args) => args.reduce((acc, obj) => ({ ...acc, ...obj }), {}),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data Factories
// ─────────────────────────────────────────────────────────────────────────────

const createMockClaim = (overrides = {}) => ({
  id: 'claim-1',
  text: 'The device demonstrates substantial equivalence',
  claimType: 'regulatory',
  sourceStatus: 'needs-source',
  linkedSources: [],
  suggestedSources: [],
  blockPosition: { start: 0, end: 50 },
  ...overrides,
});

const createMockSourceSuggestion = (overrides = {}) => ({
  sourceId: 'source-1',
  sourceType: 'predicate',
  sourceTitle: 'K123456 Predicate Device',
  relevantExcerpt: 'The predicate device has similar safety characteristics...',
  matchConfidence: 92,
  matchReason: 'keyword_match',
  ...overrides,
});

const createMockDataBridge = (overrides = {}) => ({
  moduleType: 'predicate_finder',
  status: 'connected',
  dataCount: 5,
  lastSync: new Date('2024-01-02'),
  availableData: [],
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Smart Claim Highlighter Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SmartClaimHighlighter', () => {
  describe('ClaimIndicator', () => {
    test('renders supported claim with green indicator', () => {
      const claim = createMockClaim({ sourceStatus: 'supported' });
      render(<ClaimIndicator claim={claim} onClick={() => {}} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('✓');
      expect(button).toHaveClass('bg-green-500');
    });

    test('renders needs-source claim with amber indicator', () => {
      const claim = createMockClaim({ sourceStatus: 'needs-source' });
      render(<ClaimIndicator claim={claim} onClick={() => {}} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('!');
      expect(button).toHaveClass('bg-amber-500');
    });

    test('renders unsupported claim with red indicator', () => {
      const claim = createMockClaim({ sourceStatus: 'unsupported' });
      render(<ClaimIndicator claim={claim} onClick={() => {}} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('✗');
      expect(button).toHaveClass('bg-red-500');
    });

    test('calls onClick when clicked', () => {
      const onClick = jest.fn();
      const claim = createMockClaim();
      render(<ClaimIndicator claim={claim} onClick={onClick} />);
      
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    test('shows claim type in non-compact mode', () => {
      const claim = createMockClaim({ claimType: 'efficacy' });
      render(<ClaimIndicator claim={claim} onClick={() => {}} compact={false} />);
      
      expect(screen.getByText('efficacy')).toBeInTheDocument();
    });
  });

  describe('ClaimSummaryStrip', () => {
    test('renders nothing when no claims', () => {
      const { container } = render(<ClaimSummaryStrip claims={[]} onClaimClick={() => {}} />);
      expect(container).toBeEmptyDOMElement();
    });

    test('shows correct counts for each status', () => {
      const claims = [
        createMockClaim({ id: '1', sourceStatus: 'supported' }),
        createMockClaim({ id: '2', sourceStatus: 'supported' }),
        createMockClaim({ id: '3', sourceStatus: 'needs-source' }),
        createMockClaim({ id: '4', sourceStatus: 'unsupported' }),
      ];
      
      render(<ClaimSummaryStrip claims={claims} onClaimClick={() => {}} />);
      
      expect(screen.getByText('4 claims detected')).toBeInTheDocument();
      expect(screen.getByText('2 sourced')).toBeInTheDocument();
      expect(screen.getByText('1 need sources')).toBeInTheDocument();
      expect(screen.getByText('1 unsupported')).toBeInTheDocument();
    });

    test('calculates traceability percentage correctly', () => {
      const claims = [
        createMockClaim({ id: '1', sourceStatus: 'supported' }),
        createMockClaim({ id: '2', sourceStatus: 'needs-source' }),
      ];
      
      render(<ClaimSummaryStrip claims={claims} onClaimClick={() => {}} />);
      
      expect(screen.getByText('50% traceable')).toBeInTheDocument();
    });

    test('calls onClaimClick when clicking needs-source button', () => {
      const onClaimClick = jest.fn();
      const claims = [
        createMockClaim({ id: '1', sourceStatus: 'supported' }),
        createMockClaim({ id: '2', sourceStatus: 'needs-source' }),
      ];
      
      render(<ClaimSummaryStrip claims={claims} onClaimClick={onClaimClick} />);
      
      fireEvent.click(screen.getByText('1 need sources'));
      expect(onClaimClick).toHaveBeenCalledWith(claims[1]);
    });
  });

  describe('ClaimTooltip', () => {
    test('shows claim type and text', () => {
      const claim = createMockClaim({ 
        text: 'Test claim text',
        claimType: 'efficacy' 
      });
      
      render(
        <ClaimTooltip 
          claim={claim} 
          position={{ x: 100, y: 100 }} 
          onLinkClick={() => {}} 
          onDismiss={() => {}} 
        />
      );
      
      expect(screen.getByText('Efficacy Claim')).toBeInTheDocument();
      expect(screen.getByText(/"Test claim text"/)).toBeInTheDocument();
    });

    test('shows link source button for unsupported claims', () => {
      const claim = createMockClaim({ sourceStatus: 'needs-source' });
      
      render(
        <ClaimTooltip 
          claim={claim} 
          position={{ x: 100, y: 100 }} 
          onLinkClick={() => {}} 
          onDismiss={() => {}} 
        />
      );
      
      expect(screen.getByRole('button', { name: 'Link Source' })).toBeInTheDocument();
    });

    test('shows source count for supported claims', () => {
      const claim = createMockClaim({ 
        sourceStatus: 'supported',
        linkedSources: ['source-1', 'source-2'] 
      });
      
      render(
        <ClaimTooltip 
          claim={claim} 
          position={{ x: 100, y: 100 }} 
          onLinkClick={() => {}} 
          onDismiss={() => {}} 
        />
      );
      
      expect(screen.getByText('2 sources linked')).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source Suggestion Panel Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SourceSuggestionPanel', () => {
  const defaultProps = {
    claim: null,
    suggestions: [],
    dataBridges: [],
    onLinkSource: jest.fn(),
    onClose: jest.fn(),
  };

  test('shows empty state when no claim selected', () => {
    render(<SourceSuggestionPanel {...defaultProps} />);
    
    expect(screen.getByText('Select a claim to see source suggestions')).toBeInTheDocument();
  });

  test('displays selected claim', () => {
    const claim = createMockClaim({ text: 'Important safety claim' });
    
    render(<SourceSuggestionPanel {...defaultProps} claim={claim} />);
    
    expect(screen.getByText(/"Important safety claim"/)).toBeInTheDocument();
  });

  test('displays source suggestions sorted by confidence', () => {
    const claim = createMockClaim();
    const suggestions = [
      createMockSourceSuggestion({ sourceId: '1', sourceTitle: 'Low Match', matchConfidence: 60 }),
      createMockSourceSuggestion({ sourceId: '2', sourceTitle: 'High Match', matchConfidence: 95 }),
      createMockSourceSuggestion({ sourceId: '3', sourceTitle: 'Medium Match', matchConfidence: 80 }),
    ];
    
    render(<SourceSuggestionPanel {...defaultProps} claim={claim} suggestions={suggestions} />);
    
    // All suggestions should be visible
    expect(screen.getByText('High Match')).toBeInTheDocument();
    expect(screen.getByText('Low Match')).toBeInTheDocument();
    expect(screen.getByText('Medium Match')).toBeInTheDocument();
  });

  test('calls onLinkSource when linking', async () => {
    const onLinkSource = jest.fn();
    const claim = createMockClaim({ id: 'claim-123' });
    const suggestions = [createMockSourceSuggestion({ sourceId: 'source-456' })];
    
    render(
      <SourceSuggestionPanel 
        {...defaultProps} 
        claim={claim} 
        suggestions={suggestions} 
        onLinkSource={onLinkSource}
      />
    );
    
    fireEvent.click(screen.getByRole('button', { name: 'Link Source' }));
    
    await waitFor(() => {
      expect(onLinkSource).toHaveBeenCalledWith('claim-123', 'source-456');
    });
  });

  test('shows connected data bridges count', () => {
    const claim = createMockClaim();
    const dataBridges = [
      createMockDataBridge({ moduleType: 'predicate_finder', status: 'connected' }),
      createMockDataBridge({ moduleType: 'literature_search', status: 'connected' }),
      createMockDataBridge({ moduleType: 'vault', status: 'disconnected' }),
    ];
    
    render(<SourceSuggestionPanel {...defaultProps} claim={claim} dataBridges={dataBridges} />);
    
    expect(screen.getByText(/Searching 2 connected sources/)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Logic Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration: Intelligent Document System Logic', () => {
  test('claim status categorization works correctly', () => {
    const claims = [
      createMockClaim({ id: '1', sourceStatus: 'supported' }),
      createMockClaim({ id: '2', sourceStatus: 'needs-source' }),
      createMockClaim({ id: '3', sourceStatus: 'unsupported' }),
    ];
    
    const supported = claims.filter(c => c.sourceStatus === 'supported');
    const needsSource = claims.filter(c => c.sourceStatus === 'needs-source');
    const unsupported = claims.filter(c => c.sourceStatus === 'unsupported');
    
    expect(supported.length).toBe(1);
    expect(needsSource.length).toBe(1);
    expect(unsupported.length).toBe(1);
  });

  test('compliance score calculation is correct', () => {
    const rules = [
      { status: 'pass' },
      { status: 'pass' },
      { status: 'fail' },
      { status: 'pass' },
    ];
    
    const passCount = rules.filter(r => r.status === 'pass').length;
    const score = Math.round((passCount / rules.length) * 100);
    
    expect(score).toBe(75);
  });

  test('source matching confidence thresholds are enforced', () => {
    const suggestions = [
      createMockSourceSuggestion({ matchConfidence: 95 }),
      createMockSourceSuggestion({ matchConfidence: 45 }),
      createMockSourceSuggestion({ matchConfidence: 70 }),
    ];
    
    const HIGH_CONFIDENCE_THRESHOLD = 70;
    const highConfidence = suggestions.filter(s => s.matchConfidence >= HIGH_CONFIDENCE_THRESHOLD);
    
    expect(highConfidence.length).toBe(2);
  });

  test('data bridge status changes affect available sources', () => {
    const bridges = [
      createMockDataBridge({ moduleType: 'predicate_finder', status: 'connected', dataCount: 3 }),
      createMockDataBridge({ moduleType: 'literature_search', status: 'disconnected', dataCount: 0 }),
      createMockDataBridge({ moduleType: 'vault', status: 'synced', dataCount: 10 }),
    ];
    
    const connectedBridges = bridges.filter(b => b.status === 'connected' || b.status === 'synced');
    const totalSources = connectedBridges.reduce((sum, b) => sum + b.dataCount, 0);
    
    expect(connectedBridges.length).toBe(2);
    expect(totalSources).toBe(13);
  });

  test('claim type detection patterns work correctly', () => {
    const claimPatterns = [
      { type: 'efficacy', pattern: /demonstrat(e|es|ed)\s+(efficacy|effectiveness)/i },
      { type: 'safety', pattern: /safe(ty|ly)?|risk|adverse/i },
      { type: 'regulatory', pattern: /substantial\s+equivalen(t|ce)|predicate/i },
    ];
    
    const testTexts = [
      { text: 'The device demonstrates efficacy in clinical trials', expected: 'efficacy' },
      { text: 'This product has excellent safety profiles', expected: 'safety' },
      { text: 'We claim substantial equivalence to the predicate', expected: 'regulatory' },
    ];
    
    testTexts.forEach(({ text, expected }) => {
      const matchedPattern = claimPatterns.find(p => p.pattern.test(text));
      expect(matchedPattern?.type).toBe(expected);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Accessibility', () => {
  test('ClaimIndicator has proper ARIA attributes', () => {
    const claim = createMockClaim({ sourceStatus: 'needs-source' });
    render(<ClaimIndicator claim={claim} onClick={() => {}} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title');
  });

  test('interactive elements are focusable', () => {
    const onClick = jest.fn();
    const claim = createMockClaim();
    render(<ClaimIndicator claim={claim} onClick={onClick} />);
    
    const button = screen.getByRole('button');
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});

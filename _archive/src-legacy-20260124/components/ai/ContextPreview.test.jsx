import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContextPreview from './ContextPreview';

describe('ContextPreview', () => {
  const snippets = [
    { id: 's1', chunkId: 'c1', text: 'First snippet' },
    { id: 's2', chunkId: 'c2', text: 'Second snippet' },
  ];

  it('renders no-snippets message when empty', () => {
    render(<ContextPreview snippets={[]} onSnippetClick={() => {}} />);
    expect(screen.getByText('No context snippets available.')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true', () => {
    render(<ContextPreview snippets={[]} isLoading={true} onSnippetClick={() => {}} />);
    expect(screen.getByLabelText('Loading context snippets')).toBeInTheDocument();
    expect(screen.getByText('Fetching relevant context...')).toBeInTheDocument();
  });

  it('renders error message when error is provided', () => {
    render(<ContextPreview snippets={[]} error="API Error" onSnippetClick={() => {}} />);
    expect(screen.getByText('⚠ API Error')).toBeInTheDocument();
  });

  it('renders each snippet and calls callback on click', () => {
    const handleClick = jest.fn();
    render(<ContextPreview snippets={snippets} onSnippetClick={handleClick} />);

    // Both bits of text should show
    expect(screen.getByText('First snippet')).toBeInTheDocument();
    expect(screen.getByText('Second snippet')).toBeInTheDocument();

    // Buttons should be in the DOM (visually hidden until hover)
    const buttons = screen.getAllByRole('button', { name: /Use context snippet/i });
    expect(buttons).toHaveLength(2);

    // Simulate click
    fireEvent.click(buttons[1]);
    expect(handleClick).toHaveBeenCalledWith('s2');
  });
});

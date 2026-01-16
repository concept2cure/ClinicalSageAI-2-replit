import { Bot, MessageSquare } from 'lucide-react'
import { useAuroraAssistant } from './AuroraAssistantProvider';

// Aurora Assistant Button Component - Can be placed in any module
export default function AuroraAssistantButton({
  variant = 'circle',
  label = 'Ask Aurora',
  size = 'medium',
}) {
  const { toggleAssistant } = useAuroraAssistant();

  // Size styles
  const sizeStyles = {
    small: {
      circle: 'h-8 w-8 text-sm',
      bubble: 'h-8 px-3 text-xs',
      pill: 'h-8 px-4 text-xs',
    },
    medium: {
      circle: 'h-10 w-10 text-base',
      bubble: 'h-10 px-4 text-sm',
      pill: 'h-10 px-5 text-sm',
    },
    large: {
      circle: 'h-12 w-12 text-lg',
      bubble: 'h-12 px-5 text-base',
      pill: 'h-14 px-6 text-base',
    },
  };

  // Render based on variant
  if (variant === 'circle') {
    return (
      <button
        onClick={toggleAssistant}
        className={`${sizeStyles[size][variant]} fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg z-40 transition-all duration-200 hover:scale-110`}
        aria-label="Ask Aurora AI Assistant"
      >
        <Bot />
      </button>
    );
  }

  if (variant === 'bubble') {
    return (
      <button
        onClick={toggleAssistant}
        className={`${sizeStyles[size][variant]} fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center shadow-lg z-40 transition-all duration-200`}
        aria-label="Ask Aurora AI Assistant"
      >
        <Bot className="mr-2" />
        <span>{label}</span>
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        onClick={toggleAssistant}
        className={`${sizeStyles[size][variant]} fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center shadow-lg z-40 transition-all duration-200`}
        aria-label="Ask Aurora AI Assistant"
      >
        <Bot className="mr-2" />
        <span>{label}</span>
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <button
        onClick={toggleAssistant}
        className={`inline-flex items-center px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-sm transition-colors`}
        aria-label="Ask Aurora AI Assistant"
      >
        <MessageSquare className="mr-1.5" size={14} />
        <span>{label}</span>
      </button>
    );
  }

  if (variant === 'navbar') {
    return (
      <button
        onClick={toggleAssistant}
        className="flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm transition-colors"
        aria-label="Ask Aurora AI Assistant"
      >
        <Bot className="mr-1.5" size={16} />
        <span>{label}</span>
      </button>
    );
  }

  // Default fallback
  return (
    <button
      onClick={toggleAssistant}
      className="inline-flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
      aria-label="Ask Aurora AI Assistant"
    >
      <Bot className="mr-1.5" size={16} />
      <span>{label}</span>
    </button>
  );
}

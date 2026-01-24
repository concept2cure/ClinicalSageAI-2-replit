// Lightweight wrappers to avoid dependency resolution issues
// This file provides mock implementations of various dependencies that may not be properly resolved by Vite

// react-helmet mock
export const Helmet = ({ children }) => {
  // Do nothing in the mock implementation
  return children || null;
};

// react-joyride mock
export const JoyrideProvider = ({ children }) => {
  return children;
};

export const useJoyride = () => {
  return {
    run: false,
    steps: [],
    startTour: () => {},
    stopTour: () => {},
    setSteps: () => {},
  };
};

// react-slick mock
export const Slider = ({ children }) => {
  return <div className="mock-slider">{children}</div>;
};

// react-multi-split-pane mock
export const SplitPane = ({ children }) => {
  return <div className="mock-split-pane">{children}</div>;
};

export const Pane = ({ children }) => {
  return <div className="mock-pane">{children}</div>;
};

// react-diff-viewer-continued mock
export const DiffViewer = ({ oldValue, newValue }) => {
  return (
    <div className="mock-diff-viewer">
      <div className="old-value">{oldValue}</div>
      <div className="new-value">{newValue}</div>
    </div>
  );
};

// react-dropzone mock
export const useDropzone = () => {
  return {
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  };
};

// react-hot-toast mock
export const toast = {
  success: message => console.log(`Toast success: ${message}`),
  error: message => console.log(`Toast error: ${message}`),
  loading: message => console.log(`Toast loading: ${message}`),
  custom: message => console.log(`Toast custom: ${message}`),
};

// react-select mock
export const Select = ({ options, value, onChange }) => {
  return (
    <select
      value={value}
      onChange={e => onChange({ value: e.target.value, label: e.target.value })}
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// react-table mock
export const useTable = options => {
  return {
    getTableProps: () => ({}),
    getTableBodyProps: () => ({}),
    headerGroups: [],
    rows: options.data || [],
    prepareRow: () => {},
  };
};

// @dnd-kit mocks
export const DndContext = ({ children }) => children;
export const SortableContext = ({ children }) => children;
export const useSortable = () => ({
  attributes: {},
  listeners: {},
  setNodeRef: () => {},
  transform: null,
  transition: null,
});

// vertical-timeline-component-for-react mock
export const VerticalTimeline = ({ children }) => (
  <div className="mock-vertical-timeline">{children}</div>
);

export const VerticalTimelineElement = ({ children }) => (
  <div className="mock-vertical-timeline-element">{children}</div>
);

// react-sparklines mock
export const Sparklines = ({ children }) => <div className="mock-sparklines">{children}</div>;

export const SparklinesLine = () => <div className="mock-sparklines-line"></div>;
export const SparklinesReferenceLine = () => <div className="mock-sparklines-reference-line"></div>;
export const SparklinesSpots = () => <div className="mock-sparklines-spots"></div>;

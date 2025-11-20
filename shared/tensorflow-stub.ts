// Stub for @tensorflow/tfjs-node
console.warn('[stub] TensorFlow.js stub loaded');

export const tensorflow = {
  version: 'stub-1.0.0',
  models: {
    load: async () => {
      console.warn('[stub] TensorFlow model.load called');
      return {
        predict: () => {
          console.warn('[stub] TensorFlow model.predict called');
          return { data: () => [0.5, 0.5] };
        },
        dispose: () => {
          console.warn('[stub] TensorFlow model.dispose called');
        },
      };
    },
  },
};

// Default export for wildcard imports
export default tensorflow;

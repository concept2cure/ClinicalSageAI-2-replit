declare module 'ml-stat' {
  export const test: {
    ttest: (
      array1: number[],
      array2: number[]
    ) => {
      pValue: number;
      tValue: number;
    };
  };

  export const regression: {
    linear: (
      x: number[],
      y: number[]
    ) => {
      slope: number;
      intercept: number;
      r2: number;
      predict: (value: number) => number;
    };
  };
}

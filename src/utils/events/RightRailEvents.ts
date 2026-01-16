export const DATASET_FOCUS_EVENT = 'dataset-focus-request';

interface DatasetFocusDetail {
  id: string;
}

export const triggerDatasetFocus = (datasetId: string) => {
  if (!datasetId) {
    return;
  }

  const event = new CustomEvent<DatasetFocusDetail>(DATASET_FOCUS_EVENT, {
    detail: { id: datasetId },
  });

  window.dispatchEvent(event);
};

export type SubmissionExportRecord = {
  exportId: string;
  programId: string;
  filename: string;
  createdAt: string;
  csrId: string | null;
  integrity: {
    merkleRoot: string | null;
    evidenceCount: number;
  };
};

const store = new Map<string, SubmissionExportRecord[]>();

const getKey = (organizationId: number, programId: string) =>
  `org-${organizationId}-program-${programId}`;

export const addExportRecord = (
  organizationId: number,
  programId: string,
  record: SubmissionExportRecord
) => {
  const key = getKey(organizationId, programId);
  const records = store.get(key) || [];
  records.unshift(record);
  store.set(key, records.slice(0, 50));
  return records;
};

export const listExportRecords = (organizationId: number, programId: string) => {
  const key = getKey(organizationId, programId);
  return store.get(key) || [];
};

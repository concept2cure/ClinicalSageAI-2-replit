// Temporary mock implementation until Prisma is properly set up
const prisma = {
  audit_log: {
    create: async data => {
      console.log('Mock audit log created:', data);
      return { id: 1, ...data };
    },
    findMany: async () => {
      return [];
    },
  },
  document: {
    create: async data => {
      console.log('Mock document created:', data);
      return { id: 1, ...data };
    },
    findMany: async () => {
      return [];
    },
    findUnique: async () => {
      return null;
    },
  },
  signature: {
    create: async data => {
      console.log('Mock signature created:', data);
      return { id: 1, ...data };
    },
    findMany: async () => {
      return [];
    },
  },
  study_document: {
    create: async data => {
      console.log('Mock study document created:', data);
      return { id: 1, ...data };
    },
    findMany: async () => {
      return [];
    },
  },
};

export default prisma;

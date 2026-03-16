let _prisma: any = null;

function getPrismaClient() {
  if (!_prisma) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const globalForPrisma = global as unknown as { prisma?: any };
      _prisma = globalForPrisma.prisma ?? new PrismaClient();
      if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _prisma;
    } catch (e) {
      console.warn('[prisma] PrismaClient not available — run "prisma generate" to enable database features');
      // Return a proxy that throws helpful errors on use
      _prisma = new Proxy({}, {
        get: (_target, prop) => {
          if (prop === 'then' || prop === 'catch' || typeof prop === 'symbol') return undefined;
          return () => { throw new Error(`PrismaClient not initialized. Run "prisma generate" first.`); };
        },
      });
    }
  }
  return _prisma;
}

export const prisma = new Proxy({} as any, {
  get: (_target, prop) => {
    return (getPrismaClient() as any)[prop];
  },
});

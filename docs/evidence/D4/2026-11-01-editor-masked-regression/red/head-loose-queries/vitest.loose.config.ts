import base from '/home/user/ClinicalSageAI-2-replit/vitest.config.ts';
const b: any = base;
export default { ...b, root: '/home/user/ClinicalSageAI-2-replit', server: { fs: { strict: false } },
  test: { ...b.test, include: ['/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad/d4mr/loose/*.loose.test.tsx'], dir: '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad/d4mr/loose' } };

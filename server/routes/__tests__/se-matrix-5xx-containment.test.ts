/** The old payload proxy's error branches are superseded by a truthful
 * pre-generation refusal. No external response can now leak through this route. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const { admitted, fetchMock } = vi.hoisted(() => ({ admitted: vi.fn(), fetchMock: vi.fn() }));
vi.mock('../../middleware/auth.js', () => ({ authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../services/defense-packet/request-contract', () => ({ requireShadowProgramAccess: admitted }));
import router from '../se-matrix';
function app() { const a=express(); a.use(express.json()); a.use('/api/programs',router); return a; }
beforeEach(()=> { vi.clearAllMocks(); vi.stubGlobal('fetch',fetchMock); admitted.mockImplementation((_req:unknown,_res:unknown,next:()=>void)=>next()); });
describe('SE rendering is unavailable before any external generation',()=> {
  it.each([500,503,422])('never sends an external request whose %s failure body could escape',async(status)=> {
    fetchMock.mockResolvedValue(new Response('SENTINEL-UPSTREAM-PRIVATE',{status}));
    const res=await request(app()).post('/api/programs/legacy-program/se-matrix/render').send({selectedPredicate:{kNumber:'K123456'}});
    expect(res.status).toBe(501); expect(res.body).toEqual({code:'SE_MATRIX_RENDER_UNAVAILABLE',error:'SE matrix rendering is not connected to a governed render service. No render job was created.',renderJobId:null});
    expect(fetchMock).not.toHaveBeenCalled(); expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
  });
  it('uses the same current program permission admission before refusal',async()=> {
    admitted.mockImplementation((_req:unknown,res:express.Response)=>res.status(403).json({code:'PROGRAM_ACCESS_DENIED'}));
    const res=await request(app()).post('/api/programs/legacy-program/se-matrix/render').send({});
    expect(res.status).toBe(403); expect(admitted).toHaveBeenCalledOnce(); expect(fetchMock).not.toHaveBeenCalled();
  });
});

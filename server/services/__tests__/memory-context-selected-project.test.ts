import { beforeEach,describe,expect,it,vi } from 'vitest';
const h=vi.hoisted(()=>({latest:vi.fn(),semantic:vi.fn(),client:vi.fn(),project:vi.fn(),semanticOn:false}));
vi.mock('../working-memory.js',()=>({getLatestWorkingMemoryByThread:h.latest,searchWorkingMemorySemantic:h.semantic,isSemanticWorkingMemoryEnabled:()=>h.semanticOn}));
vi.mock('../client-intelligence-memory.js',()=>({searchMemoryEntriesSemantic:h.client,searchProjectMemoryEntriesSemantic:h.project}));
import { buildMemoryContextForChat } from '../memory-context-assembler';
const INPUT={threadId:'synthetic-thread',organizationId:7,projectId:41,query:'current status'};
const entry=(id:number,title:string)=>({id,title,content:title,similarity:0.9,createdAt:new Date('2026-10-16')});
beforeEach(()=>{
  h.semanticOn=false;h.latest.mockReset().mockResolvedValue(null);h.semantic.mockReset().mockResolvedValue([]);
  h.client.mockReset().mockResolvedValue({entries:[entry(1,'ORG_PORTFOLIO_B_FACT')]});
  h.project.mockReset().mockResolvedValue({entries:[entry(2,'PROJECT_A_FACT')]});
});
describe('selected-project memory layer boundary',()=>{
  it('does not query organization operational atoms while retaining exact project recall',async()=>{
    const result=await buildMemoryContextForChat(INPUT);
    expect(result.memoryBlock).toContain('PROJECT_A_FACT');expect(result.memoryBlock).not.toContain('ORG_PORTFOLIO');
    expect(h.client).not.toHaveBeenCalled();expect(result.diagnostics.layerOutcomes?.clientMemory).toBe('skipped');
    expect(h.project).toHaveBeenCalledWith(null,41,7,'current status',expect.any(Object));
    expect(h.latest).toHaveBeenCalledWith('synthetic-thread',7,{projectId:41});
  });
  it('keeps the same project selector on semantic working memory and recency fallback',async()=>{
    h.semanticOn=true;await buildMemoryContextForChat(INPUT);
    expect(h.semantic).toHaveBeenCalledWith('synthetic-thread',7,'current status',expect.objectContaining({projectId:41}));
    expect(h.latest).toHaveBeenCalledWith('synthetic-thread',7,{projectId:41});
  });
  it('retains organization recall when the caller names no project',async()=>{
    const result=await buildMemoryContextForChat({...INPUT,projectId:undefined});
    expect(result.memoryBlock).toContain('ORG_PORTFOLIO_B_FACT');expect(h.client).toHaveBeenCalledTimes(1);
    expect(h.project).not.toHaveBeenCalled();expect(h.latest).toHaveBeenCalledWith('synthetic-thread',7);
  });
});

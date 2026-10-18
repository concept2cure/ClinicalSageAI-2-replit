import { beforeEach, describe, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({ client:vi.fn(),project:vi.fn(),wisdom:vi.fn(),anchor:vi.fn() }));
vi.mock('../../client-intelligence-memory.js',()=>({ buildClientIntelligenceContext:h.client,buildProjectIntelligenceContext:h.project }));
vi.mock('../../ana-wisdom-engine.js',()=>({ buildWisdomContext:h.wisdom }));
vi.mock('../../../db.js',()=>({db:{tag:'synthetic-db'}}));
vi.mock('../../c2c/program-project-anchor.js',()=>({resolveProgramProjectAnchor:h.anchor}));
import { getIntelligencePrefix } from '../intelligence-prefix';
let org=90000;
const PROGRAM='7abb1c22-1234-4abc-8def-0123456789ab';
beforeEach(()=>{
  org++;h.client.mockReset().mockResolvedValue('ORG_PORTFOLIO_B_STATUS');
  h.project.mockReset().mockImplementation(async id=>`PROJECT_${id}_RECORDED_FACT`);
  h.anchor.mockReset().mockResolvedValue(41);
  h.wisdom.mockReset().mockResolvedValue({engineVersion:2,projectRisks:[{severity:'high',description:'PROJECT_A_RISK'}],
    projectLesson:'PROJECT_A_LESSON',clientPattern:'ORG_PORTFOLIO_B_PATTERN',platformInsight:'GLOBAL_PORTFOLIO_ADVICE',recommendedNextAction:'GLOBAL_PORTFOLIO_ACTION'});
});
describe('a selected project never inherits organization portfolio recall',()=>{
  it('keeps exact project intelligence and project wisdom while excluding client/global facts',async()=>{
    const text=await getIntelligencePrefix(org,PROGRAM);
    expect(text).toContain('PROJECT_41_RECORDED_FACT');expect(text).toContain('PROJECT_A_LESSON');
    expect(text).not.toMatch(/ORG_PORTFOLIO|GLOBAL_PORTFOLIO/);expect(h.client).not.toHaveBeenCalled();
    expect(h.wisdom).toHaveBeenCalledWith(41,org,undefined,undefined,{projectOnly:true});
  });
  it('does not broaden an explicitly unresolved project into organization recall',async()=>{
    h.anchor.mockResolvedValue(null);const text=await getIntelligencePrefix(org,PROGRAM);
    expect(text).not.toContain('ORG_PORTFOLIO');expect(h.client).not.toHaveBeenCalled();expect(h.project).not.toHaveBeenCalled();
  });
  it('retains organization caller behavior and separates cached A/B/organization contexts',async()=>{
    const a=await getIntelligencePrefix(org,41);const b=await getIntelligencePrefix(org,42);
    expect(a).toContain('PROJECT_41_');expect(a).not.toContain('PROJECT_42_');
    expect(b).toContain('PROJECT_42_');expect(b).not.toContain('PROJECT_41_');
    expect(a+b).not.toContain('ORG_PORTFOLIO');
    expect(await getIntelligencePrefix(org)).toContain('ORG_PORTFOLIO_B_STATUS');expect(h.client).toHaveBeenCalledTimes(1);
    expect(await getIntelligencePrefix(org,41)).toBe(a);expect(h.client).toHaveBeenCalledTimes(1);
  });
});

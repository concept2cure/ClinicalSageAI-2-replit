// @vitest-environment jsdom
import React from 'react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
const apiRequest=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/queryClient',async(original)=>({...await original<typeof import('@/lib/queryClient')>(),apiRequest}));
vi.mock('@/services/portal/authService',()=>({useAuthUser:()=>null}));
import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';
import { clearNavParams,stashNavParamsForTarget } from '../navParams';
const response=(data:unknown,status=200)=>({ok:status<400,status,json:async()=>({data})}) as Response;
let refusal:boolean;
beforeEach(()=>{
  clearNavParams();refusal=false;apiRequest.mockReset();
  apiRequest.mockImplementation(async(_method:string,path:string)=>{
    if(path==='/api/mdx/gateways')return response([]);
    if(path==='/api/mdx/gateways/transmittals')return response([{id:1,transmission_id:'UNRELATED-REF',status:'queued'}]);
    const id=/^\/api\/mdx\/gateways\/transmittals\/(1001|1002)$/.exec(path)?.[1];
    if(id)return refusal ? response(null,503) : response({id:Number(id),transmission_id:'EXACT-REF-'+id,status:'received',program_id:null});
    return response([]);
  });
});
afterEach(()=>{cleanup();clearNavParams();window.history.replaceState(null,'','/');});
const mount=()=>render(<GatewayTransmittals surface={{id:'gateway-transmittals',label:'Gateway'} as any} onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma"/>);
describe('F19 exact Gateway notification targets',()=>{
  it('the fresh exact record replaces a stale copy in the bounded log',async()=>{
    const original=apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async(method:string,path:string,body?:unknown)=>path==='/api/mdx/gateways/transmittals'
      ? response([{id:1001,transmission_id:'STALE-REF',status:'queued'}]) : original(method,path,body));
    stashNavParamsForTarget('gateway-transmittals',{transmittalId:'1001'});mount();
    await screen.findByText('EXACT-REF-1001');
    expect(screen.queryByText('STALE-REF')).toBeNull();
  });
  it('loads a transmittal outside the first page and marks that exact native row',async()=>{
    stashNavParamsForTarget('gateway-transmittals',{transmittalId:'1001'});mount();
    expect(await screen.findByText('EXACT-REF-1001')).toBeTruthy();
    expect(screen.getByRole('row',{name:/Linked transmittal #1001/})).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET','/api/mdx/gateways/transmittals/1001',undefined);
  });
  it('a new same-surface handoff replaces the selected record, including an exact URL on reload',async()=>{
    window.history.replaceState(null,'','/concept2cure/gateway-transmittals?transmittalId=1001');mount();
    await screen.findByText('EXACT-REF-1001');
    act(()=>stashNavParamsForTarget('gateway-transmittals',{transmittalId:'1002'}));
    await screen.findByText('EXACT-REF-1002');
    expect(screen.queryByText('EXACT-REF-1001')).toBeNull();
  });
  it('a failed exact read stays unavailable with retry and never marks an unrelated row as the target',async()=>{
    refusal=true;stashNavParamsForTarget('gateway-transmittals',{transmittalId:'1001'});mount();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringMatching(/linked transmittal/i));
    expect(screen.queryByRole('row',{name:/Linked transmittal/})).toBeNull();
    refusal=false;fireEvent.click(screen.getByRole('button',{name:'Retry linked transmittal'}));
    await screen.findByText('EXACT-REF-1001');
  });
});

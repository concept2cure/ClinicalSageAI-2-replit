// @vitest-environment jsdom
import * as React from 'react';
import {cleanup,render,screen,waitFor,act} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({props:null as {qmsDocumentId?:string;qmsTargetRequest?:number}|null}));
vi.mock('../QualityRoute',()=>({default:(props:{qmsDocumentId?:string;qmsTargetRequest?:number})=>{h.props=props;return <div role="status">{props.qmsDocumentId}</div>;}}));
import {QualityModule} from '../../v2/surfaces/QualityModule';
import type {SurfaceViewProps} from '../../v2/surfaceViews';
import {UI_SURFACES} from '../../../../../shared/constants/ui-surface-registry';
import {clearNavParams,stashNavParamsForTarget} from '../../v2/navParams';
afterEach(()=>{cleanup();clearNavParams();});
describe('Quality adapter consumes exact notification handoffs',()=>{
  it('passes the initial exact record and a later same-surface request through QualityRoute',async()=>{
    stashNavParamsForTarget('quality',{qmsDocumentId:'4'});
    const props:SurfaceViewProps={surface:UI_SURFACES.find(s=>s.id==='quality')!,segment:'pharma',onAsk:()=>undefined,onNav:()=>undefined};
    render(<QualityModule {...props} />);
    expect(screen.getByRole('status').textContent).toBe('4');
    act(()=>stashNavParamsForTarget('quality',{qmsDocumentId:'9'}));
    await waitFor(()=>expect(h.props).toMatchObject({qmsDocumentId:'9',qmsTargetRequest:1}));
    act(()=>stashNavParamsForTarget('quality',{qmsDocumentId:'9'}));
    await waitFor(()=>expect(h.props).toMatchObject({qmsDocumentId:'9',qmsTargetRequest:2}));
  });
});

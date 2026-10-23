import gzip,hashlib,json,os,pathlib,subprocess
root=pathlib.Path('/workspace/ClinicalSageAI-2-replit');out=root/'docs/evidence/D2-CLIENT-WORKFLOW-COMPLETION/2026-10-23/ui';source=root/'client/src/concept2cure/mdx/surfaces/__tests__/OfficialEstarPanel.attachments.test.tsx';temporary=source.with_name('_estarVisual.capture.test.tsx')
append='''
import {mkdirSync,writeFileSync} from 'node:fs';
function serializeControls(container: HTMLElement) {
 const clone=container.cloneNode(true) as HTMLElement;
 const originals=[...container.querySelectorAll('select')];
 [...clone.querySelectorAll('select')].forEach((select,index)=>{
  [...select.options].forEach((option,i)=>option.toggleAttribute('selected', originals[index].options[i].selected));
 });
 [...clone.querySelectorAll('input')].forEach((input,index)=>{
  const original=container.querySelectorAll('input')[index];input.setAttribute('value',original.value);input.toggleAttribute('checked',original.checked);
 });
 return clone.innerHTML;
}
it('captures actual mounted official eSTAR picker selection and receipt', async () => {
 const dir='/workspace/scratch/estar-visual';mkdirSync(dir,{recursive:true});
 const title='Diagnostic analytical and clinical evidence — '+ 'LongEvidenceIdentity'.repeat(12);
 searchReply=()=>json(searchPage(0,{title}));
 const view=await ready({...props(),variant:'ivd'});add();
 const group=within(row());fireEvent.change(await group.findByLabelText('FDA destination'),{target:{value:COVER}});
 fireEvent.change(group.getByLabelText("Search this project's Vault"),{target:{value:'summary'}});
 fireEvent.click(group.getByRole('button',{name:'Search Vault'}));await group.findByText(title);await waitFor(()=>expect(group.getByRole('button',{name:'Search Vault'})).toHaveProperty('disabled',false));
 writeFileSync(`${dir}/picker.html`,serializeControls(view.container));
 fireEvent.click(group.getByRole('button',{name:'Select document'}));
 writeFileSync(`${dir}/selected.html`,serializeControls(view.container));
 fireEvent.click(generate());await screen.findByTestId('official-estar-attachment-receipts');
 writeFileSync(`${dir}/receipt.html`,serializeControls(view.container));
});
'''
argv=['/workspace/.tooling/node_modules/node/bin/node','node_modules/vitest/vitest.mjs','run',str(temporary.relative_to(root)),'-t','captures actual mounted','--reporter=json','--outputFile='+str(out/'dom-capture.results.json')]
try:
 temporary.write_text(source.read_text()+append)
 r=subprocess.run(argv,cwd=root,env={**os.environ,'PATH':'/workspace/.tooling/node_modules/node/bin:'+os.environ['PATH']},stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (out/'dom-capture.raw.log.gz').write_bytes(gzip.compress(r.stdout))
 paths=['client/src/concept2cure/mdx/surfaces/OfficialEstarPanel.tsx','client/src/concept2cure/mdx/surfaces/OfficialEstarAttachments.tsx','client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx']
 data={'argv':argv,'exitCode':r.returncode,'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFiles':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths},'captures':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/workspace/scratch/estar-visual').glob('*.html')}}
 (out/'dom-capture.metadata.json').write_text(json.dumps(data,indent=2)+'\n');print(json.dumps(data,indent=2))
 if r.returncode:print(r.stdout.decode(errors='replace')[-6000:])
finally:temporary.unlink(missing_ok=True)
raise SystemExit(r.returncode)

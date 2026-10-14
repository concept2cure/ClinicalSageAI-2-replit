"""Actual retained browser proof assertions; no response replacement, data or source writes."""
import datetime,hashlib,importlib.util,json,pathlib,sys,traceback
from urllib.parse import urlparse

FOLDER=pathlib.Path('/tmp/submission-deliverables-browser-prep')
REPO=pathlib.Path('/workspace/ClinicalSageAI-2-replit')
spec=importlib.util.spec_from_file_location('review',FOLDER/'review_live.py');review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
original_visual=review.visual_case
STATUS={'present':'Present','missing':'Missing','optional-absent':'Optional absent','undetermined':'Undetermined','not-applicable':'Not applicable'}
CONTENT={'substantive':'Substantive retained content','non-substantive':'No substantive retained content','undetermined':'Content undetermined'}
PIN={'match':'Source pin matched','mismatch':'Source content changed','unpinned':'No content pin','unverifiable':'Pin unverifiable'}
LIFECYCLE={'finalized':'Retained finalized source','draft':'Draft','unverified':'Lifecycle unverified','not-applicable':'Lifecycle not applicable'}

def norm(value):return ' '.join(value.split()).casefold()

def source_check():
 pins=json.loads((FOLDER/'final-production-source-pins.json').read_text())
 assert all(hashlib.sha256((REPO/name).read_bytes()).hexdigest()==digest for name,digest in pins['files'].items()),'A frozen production file changed during final browser proof.'
 config=json.loads((FOLDER/'fixture-identities.json').read_text())
 assert hashlib.sha256(pathlib.Path(config['observationPath']).read_bytes()).hexdigest()==config['observationSha256'],'Retained native observation digest changed.'
 return pins

def checked_visual(context,page,config,fixture,variant,output,traffic):
 label=variant['name']+'-'+fixture['name'];extra=traffic.setdefault('checkedTraffic',{'apiFailures':[],'consoleErrors':[],'requestFailures':[],'nonReadRequests':[],'manifestRequests':[]})
 start=len(traffic['manifests']);manifest_requests_start=len(extra['manifestRequests'])
 def observe_response(response):
  path=urlparse(response.url).path
  if response.status>=400 and '/api/' in path:
   error={'case':label,'path':path,'status':response.status}
   try:
    body=response.json();failure=body.get('error') if isinstance(body,dict) else None
    if isinstance(failure,dict):error['code']=failure.get('code');error['message']=review.safe_error(failure.get('message',''))
   except Exception:pass
   extra['apiFailures'].append(error)
 def observe_console(message):
  if message.type=='error':extra['consoleErrors'].append({'case':label,'message':review.safe_error(message.text)})
 failure_state=getattr(page,'qaFailureObserverState',None)
 if failure_state is None:
  failure_state={'case':label,'phase':'checked-case'};setattr(page,'qaFailureObserverState',failure_state)
  def observe_failed(request):
   path=urlparse(request.url).path
   if '/api/' in path:extra['requestFailures'].append({'case':failure_state['case'],'phase':failure_state['phase'],'path':path,'failure':review.safe_error(request.failure)})
  page.on('requestfailed',observe_failed)
 failure_state.update({'case':label,'phase':'checked-case'})
 def observe_request(request):
  path=urlparse(request.url).path
  if path.endswith('/pathway-manifest'):extra['manifestRequests'].append({'case':label,'method':request.method,'path':path})
  if '/api/' in path and request.method not in ['GET','HEAD','OPTIONS']:extra['nonReadRequests'].append({'case':label,'method':request.method,'path':path})
 handlers=[('response',observe_response),('console',observe_console),('request',observe_request)]
 for name,handler in handlers:page.on(name,handler)
 try:
  result=original_visual(context,page,config,fixture,variant,output,traffic)
  assert page.get_by_role('combobox',name='Submission to work on',exact=True).input_value()==str(fixture['submissionId']),'Selected submission differs.'
  assert page.get_by_role('combobox',name='Working sequence',exact=True).input_value()==str(fixture['sequenceId']),'Selected sequence differs.'
  card=page.locator('.pj-card').filter(has_text='Required deliverables · sequence')
  if fixture['expectedUnsupported']:
   assert card.locator('table.ub-inv').count()==0,'Unavailable IND invented a coverage table.'
   assert card.locator('.sc-chiprow.sc-mb').count()==0,'Unavailable IND invented coverage counts.'
   matching=[row for row in extra['manifestRequests'][manifest_requests_start:] if row['path']=='/api/submissions/sequences/'+str(fixture['sequenceId'])+'/pathway-manifest']
   assert not matching,'Unavailable recorded IND requested a coverage evaluation.'
   result['unsupportedChecks']='No table, coverage counts, manifest request or unsourced editor action; Validation remains offered.'
  else:
   matching=[row for row in traffic['manifests'][start:] if row.get('status')==200 and review.scope_matches(row.get('body'),fixture,config['organizationId'])]
   body=matching[-1]['body'];scope=body['scope']
   assert f"Program {scope['programId']} · submission {scope['submissionId']} · sequence record {scope['sequenceId']}" in card.inner_text(),'Visible evaluation scope differs.'
   table_rows=card.locator('table.ub-inv tbody tr');assert table_rows.count()==len(body['entries']),'Rendered row count differs from admitted entries.'
   row_proof=[]
   for index,entry in enumerate(body['entries']):
    cells=table_rows.nth(index).locator('td');assert cells.count()==4
    assert entry['label'] in cells.nth(0).inner_text(),'Deliverable label is on a different row.'
    requirement='Required' if entry['required'] else 'Conditional or optional'
    assert requirement in cells.nth(1).inner_text(),'Requirement differs on the deliverable row.'
    assert norm(cells.nth(2).locator('.rd-chip').first.inner_text())==norm(STATUS[entry['status']]),'Status differs on the deliverable row.'
    sources=cells.nth(3).locator(':scope > div.sc-mb');assert sources.count()==len(entry['sourceRefs']),'Source reference count differs on the deliverable row.'
    evidence=[]
    for offset,source in enumerate(entry['sourceRefs']):
     rendered=sources.nth(offset);assert rendered.locator('.sc-mono').inner_text().split('·',1)[0].strip()==f"Leaf {source['leafId']}",'Retained source leaf identity differs.'
     expected=[CONTENT[source['evidence']['content']],PIN[source['evidence']['pin']],LIFECYCLE[source['evidence']['lifecycle']]]
     assert [norm(value) for value in rendered.locator('.sc-chiprow .rd-chip').all_inner_texts()]==[norm(value) for value in expected],'Content, pin or lifecycle badge differs on its source row.'
     assert rendered.get_by_role('button',name='Open saved document',exact=True).count()==(1 if source.get('editor') is not None else 0),'Editor action differs from the admitted exact target.'
     evidence.append({'leafId':source['leafId'],'badgeLabels':expected,'exactEditorTargetPresent':source.get('editor') is not None})
    row_proof.append({'path':entry['path'],'label':entry['label'],'required':entry['required'],'status':entry['status'],'sources':evidence})
   totals=body['totals'];expected=[f"{totals['sections']} sections",f"{totals['requiredPresent']} required present",f"{totals['requiredMissing']} required missing",f"{totals['undetermined']} undetermined"]
   actual=card.locator('.sc-chiprow.sc-mb > .rd-chip').all_inner_texts();assert [norm(value) for value in actual]==[norm(value) for value in expected],'Displayed totals differ from admitted evaluation.'
   result['verifiedRows']=row_proof;result['displayedTotals']=actual
   matrix=card.locator('.cm-matrix').first
   source_row=next((index for index,entry in enumerate(body['entries']) if entry['sourceRefs']),0)
   table_rows.nth(source_row).scroll_into_view_if_needed()
   result['sourceScreenshotRow']={'index':source_row,'label':body['entries'][source_row]['label']}
   scroll=matrix.evaluate('(e)=>{const before=e.scrollLeft;e.scrollLeft=e.scrollWidth;return {client:e.clientWidth,scroll:e.scrollWidth,before,right:e.scrollLeft}}')
   if scroll['scroll']>scroll['client']:assert scroll['right']>0,'Source columns cannot be reached by existing horizontal scrolling.'
   page.screenshot(path=str(output/(label+'-source-columns.png')),full_page=False)
   result['screenshots'].append(label+'-source-columns.png');result['sourceColumnScroll']=scroll
   matrix.evaluate('(e)=>{e.scrollLeft=0}')
  theme=page.locator('.c2c-v2').get_attribute('data-theme');assert theme==('dark' if variant['dark'] else None),'Actual shell theme differs from the canonical requested preference.'
  result['rowScopeEvidenceVerified']=True
  return result
 except Exception as error:
  (output/(label+'-assertion-trace.txt')).write_text(review.safe_error(''.join(traceback.format_exception(error)))+'\n')
  raise
 finally:
  failure_state['phase']='between-cases-or-context-close'
  for name,handler in handlers:page.remove_listener(name,handler)

review.visual_case=checked_visual
before=source_check();held_manifest_digest=hashlib.sha256((FOLDER/'final-production-source-pins.json').read_bytes()).hexdigest();held_helpers=json.loads((FOLDER/'final-helper-pins.json').read_text());held_helper_manifest_digest=hashlib.sha256((FOLDER/'final-helper-pins.json').read_bytes()).hexdigest();started=datetime.datetime.now(datetime.timezone.utc).isoformat();preexisting_reviews=set(FOLDER.glob('review-*'))
try:review.main()
except SystemExit as finished:
 created_reviews=set(FOLDER.glob('review-*'))-preexisting_reviews
 if len(created_reviews)!=1:raise
 output=created_reviews.pop()
 if not (output/'summary.json').exists():raise
 summary=json.loads((output/'summary.json').read_text())
 after=source_check();assert after==before,'Final source pin object changed during the run.'
 assert hashlib.sha256((FOLDER/'final-production-source-pins.json').read_bytes()).hexdigest()==held_manifest_digest,'Final source pin file changed during the run.'
 assert hashlib.sha256((FOLDER/'final-helper-pins.json').read_bytes()).hexdigest()==held_helper_manifest_digest,'Final helper manifest changed during the run.'
 assert all(hashlib.sha256((FOLDER/name).read_bytes()).hexdigest()==digest for name,digest in held_helpers['files'].items()),'Final helper/config bytes changed during the run.'
 summary['helperSourcePins']=held_helpers;summary['productionSourcePins']=before;summary['sourceStableBeforeAfter']=True;summary['checkedRunStartedAt']=started
 expected=(len(json.loads((FOLDER/'fixture-identities.json').read_text())['fixtures'])+len(summary['discoveredRetainedCases']))*len(json.loads((FOLDER/'fixture-identities.json').read_text())['variants'])
 summary['expectedCases']=expected;summary['casesAttempted']=len(summary['variants'])+len(summary['errors'])
 extra=summary.get('checkedTraffic',{});allowed={('POST','/api/510k/estar/assemble')}
 summary['unexpectedNonReadRequests']=[item for item in extra.get('nonReadRequests',[]) if (item['method'],item['path']) not in allowed]
 summary['coveragePassed']=summary['passed'] and len(summary['variants'])==expected and summary['casesAttempted']==expected and not summary['unexpectedNonReadRequests']
 summary['cleanRuntime']=summary['coveragePassed'] and not summary['apiFailures'] and not summary['consoleErrors'] and not extra.get('requestFailures',[])
 summary['passed']=summary['coveragePassed']
 summary['qualification']+=' CoveragePassed and cleanRuntime are separate: actual named retained-fixture refusals/resource console errors are retained and are not called a globally clean run.'
 summary['allowedBackgroundPost']='Canonical POST /api/510k/estar/assemble is verified read-only; no sign/freeze/dispatch/authoring/create/transition request is allowed.'
 summary['artifacts']=[{'path':str(artifact),'bytes':artifact.stat().st_size,'digestAlgorithm':'sha256','digest':hashlib.sha256(artifact.read_bytes()).hexdigest()} for artifact in sorted(output.glob('*.png'))]
 (output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
 print(json.dumps({'coveragePassed':summary['coveragePassed'],'cleanRuntime':summary['cleanRuntime'],'output':str(output),'expectedCases':expected,'casesPassed':len(summary['variants']),'casesFailed':len(summary['errors']),'apiFailures':len(summary['apiFailures']),'consoleErrors':len(summary['consoleErrors']),'requestFailures':len(extra.get('requestFailures',[])),'unexpectedNonReadRequests':len(summary['unexpectedNonReadRequests'])}))
 raise SystemExit(0 if summary['coveragePassed'] else 1)

export function createApiState(snapshot,mode){
  const document={...snapshot.document,status:mode==='frozen'?'FROZEN':snapshot.document.status};
  return {document,requests:[],decisions:[],patches:[],unexpected:[],consoleErrors:[],pageErrors:[],snapshot};
}
function documentResponse(path,state){
  const {snapshot,document}=state;
  const access=Object.fromEntries(['freeze','esign','esignReview','fileToVault','assignReview','placeIntoFiling'].map(k=>[k,{allowed:true,reason:null}]));
  const replies=new Map([
    [`/api/authoring/docs/${document.id}`,{success:true,document,access}],
    [`/api/authoring/docs/${document.id}/sections`,{success:true,sections:snapshot.sections,structure:{duplicateCodes:[],outOfOrder:false,suggestedOrder:snapshot.sections.map(s=>s.id)}}],
    [`/api/authoring/docs/${document.id}/citations`,[]],
    [`/api/authoring/documents/${document.id}/comments`,{success:true,comments:[]}],
    [`/api/authoring/docs/${document.id}/audit`,{success:true,events:[]}],
  ]);
  return replies.has(path)?{body:replies.get(path)}:null;
}
function sourceResponse(path,url,snapshot){
  const program=snapshot.program;
  if(path===`/api/c2c/projects/${program.id}/sources`)return {body:{projectId:program.id,sources:[],total:0,currentTotal:0,page:{limit:Number(url.searchParams.get('limit')),offset:Number(url.searchParams.get('offset'))},window:{shown:0,truncated:false}}};
  if(/^\/api\/authoring\/sections\/[^/]+\/sources$/.test(path))return {body:{success:true,sources:[]}};
  if(path==='/api/data-origins/document'){
    const section=snapshot.sections.find(s=>s.id===url.searchParams.get('documentId'));
    const length=section.content.replace(/<[^>]*>/g,'').length;
    return {body:{summary:{documentTable:'authoring_sections',documentId:section.id,contentLength:length,attributedChars:0,unattributedChars:length,byKind:{fromSources:0,authorAsserted:0,machineDrafted:0,machineDraftedUnaccepted:0},staleChars:0,spans:[],generatedAt:section.updated_at}}};
  }
  return null;
}
function fixedResponse(path,snapshot){
  const replies=new Map([
    ['/api/authoring/templates',{success:true,templates:[]}],
    ['/api/v1/auth/session',{authenticated:true,user:{id:1,email:'synthetic@example.invalid',displayName:'Synthetic evaluator',organizationId:1,roles:['regulatory-author']}}],
    [`/api/c2c/projects/${snapshot.program.id}`,snapshot.program],
    ['/api/c2c/documents',{documents:[]}],
  ]);
  return replies.has(path)?{body:replies.get(path)}:null;
}
function decisionResponse(request,path,state){
  if(request.method()!=='POST'||!/^\/api\/authoring\/documents\/[^/]+\/tracked-change-decisions(?:\/bulk)?$/.test(path))return null;
  const body=request.postDataJSON();
  if(!path.includes(state.document.id)||body.sectionId!==state.snapshot.remedy.sectionId)throw new Error('Audit decision escaped the qualified document/section scope.');
  state.decisions.push({path,body});
  return {body:{success:true,recorded:true}};
}
export async function interceptApi(route,state){
  const request=route.request();const url=new URL(request.url());const path=url.pathname;
  state.requests.push({method:request.method(),path,query:url.search});
  if(request.method()==='PATCH')state.patches.push({path,body:request.postDataJSON()});
  const result=decisionResponse(request,path,state)??documentResponse(path,state)??sourceResponse(path,url,state.snapshot)??fixedResponse(path,state.snapshot);
  if(result)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result.body)});
  state.unexpected.push({method:request.method(),path});
  return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,message:'Unconfigured synthetic fixture endpoint'})});
}

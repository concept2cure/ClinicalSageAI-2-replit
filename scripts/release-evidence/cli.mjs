#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { DISCLAIMER, git, repositoryFingerprints, resolveEvidencePath, sha256, validateManifest, verifyArtifactFiles } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(3).reduce((a,v,i,x)=>v.startsWith('--') ? (a.push([v.slice(2),x[i+1]]),a):a,[]));
const command = process.argv[2]; const root = process.cwd();
const readJson = async p => JSON.parse(await readFile(path.resolve(root,p),'utf8'));
if (command === 'generate') {
  const inputPath=args.input || 'release-evidence-input.json';
  const input = await readJson(inputPath);
  const policyPath=args.policy || 'config/release-evidence-policy.v1.json';
  const policyBytes=await readFile(path.resolve(root,policyPath));
  const policy=JSON.parse(policyBytes);
  const allowedUntracked=new Set([inputPath,...(input.artifacts || []).map(a=>a.path)].filter(p=>!path.isAbsolute(p)).map(p=>path.normalize(p)));
  const changes=git(['status','--porcelain','--untracked-files=all'], root).split('\n').filter(Boolean);
  const dirty=changes.filter(line=>line.slice(0,2)!=='??'||!allowedUntracked.has(path.normalize(line.slice(3))));
  if (dirty.length) throw new Error(`Refusing to generate evidence from a dirty worktree: ${dirty.join(', ')}`);
  const commit=git(['rev-parse','HEAD']), tree=git(['rev-parse','HEAD^{tree}']);
  if (input.commit && input.commit !== commit) throw new Error('Input metadata belongs to a different commit');
  const fps=await repositoryFingerprints(root); const artifacts=[];
  for (const item of input.artifacts || []) {
    const evidencePath=await resolveEvidencePath(root,item.path);
    let bytes; try { bytes=await readFile(evidencePath); } catch {}
    const current=bytes ? sha256(bytes) : 'missing';
    const status=!bytes?'missing':item.commit!==commit||item.tree!==tree||item.sha256&&item.sha256!==current?'stale':'verified';
    artifacts.push({id:item.id,kind:item.kind,path:item.path,sha256:current,commit:item.commit||'unknown',tree:item.tree||'unknown',status});
  }
  const jobs=policy.requiredJobs.map(required => {
    const matches=(input.workflowJobs || []).filter(j=>j.workflow===required.workflow&&j.job===required.job);
    if (matches.length > 1) throw new Error(`Duplicate workflow metadata for ${required.workflow}/${required.job}`);
    const found=matches[0];
    return found ? {...found,required:true,conclusion:found.conclusion||'unknown'} : {...required,required:true,conclusion:'missing',headSha:'unknown',runId:null};
  });
  let remote='unknown'; try { remote=git(['config','--get','remote.origin.url'])||remote; } catch {}
  const manifest={schemaVersion:'1.0.0',policy:{version:policy.policyVersion,sha256:sha256(policyBytes)},repository:{url:input.repositoryUrl||remote,commit,tree,dirty:false},runtime:{node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),platform:process.platform,architecture:process.arch},fingerprints:fps,artifacts,workflows:jobs,automatedEvidence:input.automatedEvidence||{},knownDeviations:input.knownDeviations||[],humanApprovals:policy.humanApprovalRoles.map(role=>({role,status:'unapproved',signer:null,signedAt:null,signature:null,authorizationEvidence:null})),disclaimer:DISCLAIMER};
  const output=path.resolve(root,args.output||'release-evidence'); await mkdir(output,{recursive:true});
  const body=JSON.stringify(manifest,null,2)+'\n'; await writeFile(path.join(output,'manifest.json'),body);
  const deviations=manifest.knownDeviations.length ? manifest.knownDeviations.map(d=>`- ${d.id} — **${d.disposition}** — ${d.description}`) : ['- None declared.'];
  const index=['# Release Evidence Index','',`Commit: \`${commit}\`  `,`Tree: \`${tree}\`  `,`Manifest SHA-256: \`${sha256(body)}\``, '', '## Automated engineering evidence', ...artifacts.map(a=>`- ${a.id}: **${a.status}** — \`${a.sha256}\` (${a.path})`), ...jobs.map(j=>`- ${j.workflow} / ${j.job}: **${j.conclusion}**`),'','## Known deviations (reviewers must disposition each entry)',...deviations,'','## Human decisions (separate governed process)',...manifest.humanApprovals.map(a=>`- ${a.role}: **unapproved**`),'',`> ${DISCLAIMER}`,''].join('\n');
  await writeFile(path.join(output,'index.md'),index); console.log(`Generated ${path.relative(root,output)}/manifest.json for ${commit}`);
} else if (command === 'validate') {
  const manifest=await readJson(args.manifest||'release-evidence/manifest.json');
  const policyBytes=await readFile(path.resolve(root,args.policy||'config/release-evidence-policy.v1.json'));
  const policy=JSON.parse(policyBytes);
  const schema=await readJson('schemas/release-evidence-manifest.v1.schema.json');
  const schemaValid=new Ajv2020({allErrors:true}).compile(schema);
  if (!schemaValid(manifest)) { console.error(schemaValid.errors.map(e=>`${e.instancePath || '/'} ${e.message}`).join('\n')); process.exit(1); }
  const expected={commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),fingerprints:await repositoryFingerprints(root),policy,policySha256:sha256(policyBytes)};
  const errors=[...validateManifest(manifest,expected),...await verifyArtifactFiles(manifest,root)]; if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log(`Valid release evidence for ${expected.commit}`);
} else { console.error('Usage: cli.mjs generate|validate'); process.exit(2); }

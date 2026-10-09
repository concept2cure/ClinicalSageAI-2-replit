import json, re, sys, glob
import os
sp=os.path.dirname(os.path.abspath(__file__))  # this evidence folder: scan.json, all.names, verdicts/
repo=os.path.abspath(os.path.join(sp, '../../../..'))
scan={e['tool']:e for e in json.load(open(sp+'/scan.json'))}
allnames=[l.strip() for l in open(sp+'/all.names') if l.strip()]
entries={}
def parse(path):
    for line in open(path):
        line=line.strip()
        if not line: continue
        parts=[p.strip() for p in line.split('|')]
        name,cls,rule,site,what=parts[0],parts[1],parts[2],parts[3],' | '.join(parts[4:])
        if name in entries: sys.exit(f'duplicate verdict for {name}')
        entries[name]={'class':cls,'writes':what,'site':site,**({'rule':rule} if rule!='-' else {})}
for f in sorted(glob.glob(sp+'/verdicts/candidates-batch[0-3].txt'))+sorted(glob.glob(sp+'/verdicts/presumed-read-batch[0-7].nonreads.txt')): parse(f)
# Tools the deep pass verified read: every name in r0..r7 without a non-read verdict.
for i in range(8):
    for line in open(f'{sp}/verdicts/presumed-read-batch{i}.txt'):
        name,site=line.rstrip('\n').split('\t')
        if name not in entries:
            entries[name]={'class':'read','writes':'none','site':site.replace('server/services/ana/','').replace('server/services/','')}
for name in allnames:
    if name.startswith('global_ri_'):
        entries[name]={'class':'read','writes':'none (pure global-RI knowledge service)','site':'global-ri/ana-tools-dispatch.ts'}
entries['execute_platform_command']['class']='command'
entries['execute_platform_command']['writes']='whatever the command does; the command partition (command-rbac.ts, part11-governance.ts) classifies it'
ESIGN='An approval is an e-signed act: the person does it with the Approve button, which asks for their password and second factor.'
FINAL='Finalizing is a signed act the person performs on its own surface.'
WHY={
 'ack_training':'A training acknowledgement is the trainee’s own attestation; they record it themselves on the document’s training record.',
 'cast_committee_vote':'A committee vote is the member’s own act; each member casts it from the agenda item.',
 'retire_qms_document':'Retiring a controlled document takes it out of force; a person does it from the QMS document, with a reason.',
 'certify_other_support':'Certifying Other Support is the investigator’s own certification, which they sign.',
 'execute_research_agreement':'Executing an agreement is a signed act a person performs on the agreement.',
 'execute_subaward':'Executing a subaward is a signed act a person performs on the subaward.',
 'transmit_submission':'Transmitting a submission to an agency is a person’s authorised, signed act, done from the Submission Center.',
}
for n,e in entries.items():
    if e['class']=='refuse' and e['writes'].startswith('none; the handler already refuses'):
        # Its own refusal says who signs and where (and, for some, what is still
        # missing); it is pinned to write nothing by ana-cannot-sign.test.ts.
        e['refusedBy']='handler'
    if e['class']=='refuse':
        e['why']=WHY.get(n) or (ESIGN if n.startswith('approve_') else FINAL if n.startswith('finalize_') else None)
        if not e['why']: sys.exit(f'refuse entry without a why: {n}')
missing=[n for n in allnames if n not in entries]; extra=[n for n in entries if n not in set(allnames)]
if missing or extra: sys.exit(f'missing {missing} extra {extra}')
bad=[n for n,e in entries.items() if e['class'] not in ('read','self','confirm','refuse','conditional','command')]
if bad: sys.exit(f'bad class {bad}')
out={'$comment':'AnA tool register (P1-34). One entry per registered tool: its class, what it writes, where. Classes and the input rules are explained in tool-authorization.ts. Classification evidence: docs/evidence/D6/2026-09-26-p1-34/.',
     'tools':{n:entries[n] for n in sorted(entries)}}
json.dump(out,open(repo+'/server/services/ana/tool-authorization.register.json','w'),indent=1,ensure_ascii=False)
open(repo+'/server/services/ana/tool-authorization.register.json','a').write('\n')
from collections import Counter
print(Counter(e['class'] for e in entries.values()))

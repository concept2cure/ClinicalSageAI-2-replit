from datetime import datetime, timedelta
import glob, json, hashlib, os
from ind_automation import rules_store
import os, smtplib
from email.message import EmailMessage
import requests
from pathlib import Path
import json



###############  ALL‑IN ALERTS  ################
THRESH = {
    'ack_missing_h': 24,
    'module3_stale_d': 180,
    'module1_stale_d': 90,
    'esg_warn_d': 330,
    'esg_crit_d': 365,
}

def _ack_missing():
    alerts=[]
    for org in os.listdir('data/projects'):
        hist=db.get_history(org.replace('.json',''))
        for h in hist[::-1]:
            if h.get('type')=='esg_submission' and h.get('status')!='ACK_RECEIVED':
                age=(now-datetime.datetime.fromisoformat(h['timestamp'])).total_seconds()/3600
                if age>THRESH['ack_missing_h']:
                    alerts.append((org,'ESG ACK missing >24h'))
                    break
    return alerts

def _forms_missing():
    alerts=[]
    for p in pathlib.Path('ectd').glob('*/*'):
        org,serial=p.parts[-2],p.parts[-1]
        required=['m1/1571.docx','m1/1572.docx','m1/3674.docx']
        if not all((p/f).exists() for f in required):
            alerts.append((org,f'Missing Module1 form(s) in serial {serial}'))
    return alerts

def _dup_serial():
    alerts=[]
    for orgPath in pathlib.Path('ectd').glob('*'):
        serials=[d.name for d in orgPath.iterdir() if d.is_dir()]
        dups=set([s for s in serials if serials.count(s)>1])
        for d in dups:
            alerts.append((orgPath.name,f'Duplicate serial {d}'))
    return alerts

def _meta_incomplete():
    alerts=[]
    for f in pathlib.Path('data/projects').glob('*.json'):
        org=f.stem; meta=json.loads(f.read_text())
        for field in ['sponsor','pi_name','ind_number']:
            if not meta.get(field):
                alerts.append((org,f'Project metadata missing {field}'))
                break
    return alerts

def _module3_stale():
    alerts=[]
    cutoff=now-timedelta(days=THRESH['module3_stale_d'])
    for m3 in pathlib.Path('output').glob('Module3_*.docx'):
        if datetime.datetime.fromtimestamp(m3.stat().st_mtime)<cutoff:
            alerts.append((m3.stem.split('_')[-1],'Module3 doc >180 days old'))
    return alerts

def _module1_stale():
    alerts=[]; cutoff=now-timedelta(days=THRESH['module1_stale_d'])
    for f in glob.glob('output/Form{1571,1572,3674}_*.docx',recursive=True):
        p=pathlib.Path(f)
        if datetime.datetime.fromtimestamp(p.stat().st_mtime)<cutoff:
            alerts.append((p.stem.split('_')[-1],'Module1 forms >90 days old'))
    return alerts

def _esg_rotate():
    alerts=[]
    for org in os.listdir('data/projects'):
        meta=db.load(org.replace('.json',''))
        created=datetime.datetime.fromisoformat(meta.get('created','2020-01-01'))
        age=(now-created).days
        if age>THRESH['esg_crit_d']:
            alerts.append((org,'ESG key older than 12 months (CRITICAL)'))
        elif age>THRESH['esg_warn_d']:
            alerts.append((org,'ESG key older than 11 months (WARN)'))
    return alerts

def _idp_mismatch():
    alerts=[]
    for f in pathlib.Path('data/saml_creds').glob('*.json'):
        org=f.stem; cur=json.loads(fernet.decrypt(f.read_bytes()))
        fp=hashlib.sha1(cur['idp_x509'].encode()).hexdigest()[:16]
        meta=db.load(org)
        if meta and meta.get('saml_fp') and meta['saml_fp']!=fp:
            alerts.append((org,'IdP certificate fingerprint changed!'))
    return alerts

from celery.result import AsyncResult
import glob, hashlib

FAILURE_CHECK_MIN = 30
M2_STALE_DAYS = 90

def _esg_failures():
    alerts=[]
    alerts+=[] # Will be filtered below
    for task_file in Path('celery_taskmeta').glob('*.json'):
        data=json.loads(task_file.read_text())
        if data.get('task_name')=='ind_automation.tasks.submit_to_esg' and data['status']=='FAILURE':
            age=(now-datetime.datetime.fromisoformat(data['date_done'])).total_seconds()/60
            if age>FAILURE_CHECK_MIN:
                alerts.append((data['args'][0],'ESG submission FAILURE >30min'))
    return alerts

def _missing_module3():
    alerts=[]
    alerts+=[] # Will be filtered below
    for p in Path('ectd').glob('*/*'):
        project,serial=p.parts[-2],p.parts[-1]
        m3=Path(f'output/Module3_{project}.docx')
        if not m3.exists():
            alerts.append((project,f'Module3 doc missing for serial {serial}'))
    return alerts

def _stale_m2():
    alerts=[]
    alerts+=[] # Will be filtered below
    cutoff=now-datetime.timedelta(days=M2_STALE_DAYS)
    for m2 in Path('output').glob('Module2_*.docx'):
        if datetime.datetime.fromtimestamp(m2.stat().st_mtime)<cutoff:
            alerts.append((m2.stem.split('_')[-1],'Module2 narrative >90 days old'))
    return alerts

def _saml_fingerprint_changes():
    alerts=[]
    alerts+=[] # Will be filtered below
    for f in Path('data/saml_creds').glob('*.json'):
        org=f.stem; cur=json.loads(fernet.decrypt(f.read_bytes()))
        fp=hashlib.sha1(cur['idp_x509'].encode()).hexdigest()[:16]
        last=db.load(org).get('saml_fp') if db.load(org) else None
        if last and last!=fp:
            alerts.append((org,'IdP certificate changed!'))
            db.append_history(org,{"type":"alert","msg":"IdP cert changed","timestamp":now.isoformat()})
            rec=db.load(org); rec['saml_fp']=fp; db.save(org,rec)
    return alerts

from dateutil import parser
from ind_automation import db, saml_creds, metrics
from ind_automation.credentials import load as load_esg
from ind_automation.tasks import celery_app

# For fallback/system-wide notifications
TEAMS_WEBHOOK_URL=os.getenv("TEAMS_WEBHOOK_URL")
SMTP_HOST=os.getenv('SMTP_HOST'); SMTP_PORT=int(os.getenv('SMTP_PORT','0'))
SMTP_USER=os.getenv('SMTP_USER'); SMTP_PASS=os.getenv('SMTP_PASS'); ALERT_EMAIL=os.getenv('ALERT_EMAIL')

# For customer-specific Teams webhooks
WEBHOOKS_DIR = Path('data/teams_webhooks')
WEBHOOKS_DIR.mkdir(parents=True, exist_ok=True)

def _get_org_webhook(org_id: str) -> str:
    """Get the organization-specific Teams webhook URL if configured"""
    webhook_path = WEBHOOKS_DIR / f"{org_id}.json"
    if not webhook_path.exists():
        return None
        
    try:
        with open(webhook_path, 'r') as f:
            data = json.load(f)
            return data.get('webhook_url')
    except Exception:
        return None

def _send_teams(message, org_id=None):
    """
    Send Teams notification - either to org-specific webhook or system webhook
    
    Args:
        message: The message to send
        org_id: Optional organization ID to use their specific webhook
    """
    # First try organization-specific webhook if org_id is provided
    webhook_url = None
    if org_id:
        webhook_url = _get_org_webhook(org_id)
    
    # Fall back to system-wide webhook if no org webhook or if no org_id
    if not webhook_url:
        webhook_url = TEAMS_WEBHOOK_URL
        
    # If no webhook available, skip sending
    if not webhook_url:
        return
        
    payload = {
        "@type":"MessageCard","@context":"https://schema.org/extensions",
        "summary":"TrialSage Alert","themeColor":"0076D7",
        "title":"TrialSage Compliance Alert",
        "text": message.replace('\n','<br>')
    }
    try:
        requests.post(webhook_url, json=payload, timeout=5)
    except Exception as e:
        print('Teams webhook error', e)

def _send_email(subject, body):
    if not SMTP_HOST or not ALERT_EMAIL: return
    msg = EmailMessage(); msg['Subject']=subject; msg['From']=SMTP_USER; msg['To']=ALERT_EMAIL; msg.set_content(body)
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as s:
        s.login(SMTP_USER, SMTP_PASS); s.send_message(msg)

@celery_app.on_after_configure.connect
def setup_periodic(sender, **_):
    sender.add_periodic_task(24*3600, nightly_audit.s(), name='Nightly audit 2AM UTC',
                             expires=3600, run_every=86400)

@celery_app.task
def nightly_audit():
    now=datetime.utcnow(); alerts=[]
    alerts+=[] # Will be filtered below
    for file in (db.Path('data/projects').glob('*.json')):
        org=file.stem; meta=db.load(org)
        # ESG key age
        esg=load_esg(org)
        if esg:
            created=parser.parse(meta.get('created','2020-01-01'))
            if now-created>timedelta(days=365):
                alerts.append((org,'ESG key >12mo; rotate soon'))
        # SAML cert expiry
        s=saml_creds.load(org)
        if s:
            # crude expiry by reading cert end date line
            for line in s['idp_x509'].splitlines():
                if 'Not After' in line:
                    exp=parser.parse(line.split(':',1)[1].strip())
                    if exp-now<timedelta(days=30):
                        alerts.append((org,'SAML certificate expires <30 days'))
    for org,msg in alerts:
        db.append_history(org,{"type":"alert","msg":msg,"timestamp":now.isoformat()})
        metrics_sql.refresh(org)  # refresh metrics cache
    # Filter alerts based on customer's enabled rules
    filtered_alerts = []
    for org, msg in alerts:
        # Extract rule key from message
        rule_key = None
        if "ESG ACK missing" in msg:
            rule_key = "ACK_MISSING"
        elif "Missing Module1 form" in msg:
            rule_key = "FORMS_MISSING"
        elif "Duplicate serial" in msg:
            rule_key = "SERIAL_DUP"
        elif "metadata missing" in msg:
            rule_key = "META_INCOMPLETE"
        elif "Module3 doc" in msg:
            rule_key = "MODULE3_STALE"
        elif "Module1 forms" in msg:
            rule_key = "MODULE1_STALE"
        elif "ESG key older" in msg:
            rule_key = "ESG_ROTATE"
        elif "SAML certificate expires" in msg:
            rule_key = "SAML_EXPIRE"
        elif "IdP certificate" in msg:
            rule_key = "IDP_MISMATCH"
        
        # Only include alert if rule is enabled
        if rule_key and rules_store.load(org).get(rule_key, True):
            filtered_alerts.append((org, msg))
    
    alerts = filtered_alerts
    
    # Group alerts by organization
    by_org = {}
    for org, msg in alerts:
        if org not in by_org:
            by_org[org] = []
        by_org[org].append(msg)
    
    # Send org-specific alerts to their Teams channels
    for org, messages in by_org.items():
        org_msg = f"Organization: {org}\n" + "\n".join(f"- {m}" for m in messages)
        # Send to org's Teams channel if configured
        _send_teams(org_msg, org_id=org)
    
    # Also send an aggregate alert to system-wide channels if any alerts exist
    if alerts:
        msg = "\n".join(f"{o}: {m}" for o,m in alerts)
        _send_email('TrialSage audit alerts', msg)
        _send_teams(msg)

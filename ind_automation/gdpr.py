import json, os, io, shutil, datetime, asyncio, zipfile
from pathlib import Path
from ind_automation import db, metrics_sql
EXPORT_DIR=Path('exports'); EXPORT_DIR.mkdir(exist_ok=True)
RETENTION=int(os.getenv('RETENTION_DAYS',730))

def export_user(username):
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        # profile
        prof=db.Path('data/users.json').read_text()
        z.writestr('profile.json',prof)
        # history
        for pj in Path('data/projects').glob('*.json'):
            h=db.load(pj.stem);
            z.writestr(f'history/{pj.name}',json.dumps(h,indent=2))
        # metrics DB dump (filtered)
        # (for brevity include full db)
        z.write('data/metrics.db','metrics.db')
    buf.seek(0); return buf

def purge_user(username):
    data=db.Path('data/users.json'); users=json.loads(data.read_text());
    if username in users: users[username]|={'deleted':str(datetime.date.today())};users[username]['pw']=''
    data.write_text(json.dumps(users,indent=2))
    # schedule hard delete
    from ind_automation.tasks import hard_delete_user
    hard_delete_user.apply_async(args=[username], countdown=30*24*3600)

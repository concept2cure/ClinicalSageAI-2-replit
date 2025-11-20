"""esg_ack_poller.py – Background task to retrieve ESG ACK files (ACK1/ACK2/ACK3)
Parses acknowledgment XML, updates INDSequence.status and stores receipt paths.
Run via Celery beat or cron every 30 min.
Requires: paramiko, lxml
"""
import os, paramiko, logging, tempfile
from lxml import etree
from datetime import datetime
from server.db import SessionLocal
from server.models.sequence import INDSequence

ESG_HOST  = os.getenv("ESG_HOST")
ESG_PORT  = int(os.getenv("ESG_PORT", "22"))
ESG_USER  = os.getenv("ESG_USER")
ESG_KEY   = os.getenv("ESG_KEY")
ESG_BASE_DIR = os.getenv("ESG_REMOTE_PATH", "/out")  # ESG outbox

logger = logging.getLogger("esg_ack")
logger.setLevel(logging.INFO)


def fetch_acks():
    """Connect to ESG and pull down new ACK files."""
    key = paramiko.RSAKey.from_private_key_file(ESG_KEY) if os.path.isfile(ESG_KEY) else paramiko.RSAKey.from_private_key(paramiko.StringIO(ESG_KEY))
    transport = paramiko.Transport((ESG_HOST, ESG_PORT))
    transport.connect(username=ESG_USER, pkey=key)
    sftp = paramiko.SFTPClient.from_transport(transport)

    db = SessionLocal()
    for seq in db.query(INDSequence).filter(INDSequence.status == "Submitted").all():
        remote_dir = f"{ESG_BASE_DIR}/{seq.sequence}"
        try:
            files = sftp.listdir(remote_dir)
        except IOError:
            logger.warning("No ACK dir yet for seq %s", seq.sequence)
            continue
        for fname in files:
            if fname.startswith("ack") and fname.endswith(".xml"):
                local_dir = f"/mnt/data/ectd/{seq.sequence}/acks"
                os.makedirs(local_dir, exist_ok=True)
                local_path = os.path.join(local_dir, fname)
                if os.path.exists(local_path):
                    continue  # already downloaded
                sftp.get(os.path.join(remote_dir, fname), local_path)
                logger.info("Downloaded %s for seq %s", fname, seq.sequence)
                _process_ack(fname, local_path, seq, db)
    db.commit()
    db.close()
    sftp.close()
    transport.close()


def _process_ack(fname: str, path: str, seq: INDSequence, db):
    doc = etree.parse(path)
    if fname.startswith("ack1"):
        seq.ack1_path = path
        seq.status = "ESG ACK1 Received"
    elif fname.startswith("ack2"):
        seq.ack2_path = path
        status = doc.xpath("string(//submissionStatus)")
        if status.lower().startswith("success"):
            seq.status = "ESG ACK2 Success"
        else:
            seq.status = "ESG ACK2 Error"
    elif fname.startswith("ack3"):
        seq.ack3_path = path
        seq.status = "Centre Receipt"
    seq.updated_at = datetime.utcnow()
    db.add(seq)

if __name__ == "__main__":
    fetch_acks()
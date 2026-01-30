from celery import Celery
import os
from services.job_store import get_store
from services.secure_runner import run_container, RunnerError
from pathlib import Path
import uuid
import shutil

BROKER = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

app = Celery("ectd_tasks", broker=BROKER, backend=BACKEND)
store = get_store()


@app.task(bind=True)
def generate_docx_task(self, job_id: str, data_path: str, template_path: str = None):
    """Celery task to run the secure runner and update job status in the job store."""
    store.set(job_id, {"status": "PROCESSING"})
    try:
        out_dir = Path(shutil.mkdtemp(prefix=f"docgen_{job_id}_"))
        code, stdout, stderr = run_container(data_path, str(out_dir), template_docx=template_path)
        if code == 0:
            generated = out_dir / "generated.docx"
            if generated.exists():
                store.set(job_id, {"status": "COMPLETED", "output": str(generated)})
                return {"status": "COMPLETED", "output": str(generated)}
            else:
                store.set(job_id, {"status": "FAILED", "error": "No output file"})
                return {"status": "FAILED", "error": "No output file"}
        else:
            store.set(job_id, {"status": "FAILED", "error": stderr or stdout})
            return {"status": "FAILED", "error": stderr or stdout}
    except RunnerError as e:
        store.set(job_id, {"status": "FAILED", "error": str(e)})
        return {"status": "FAILED", "error": str(e)}
    except Exception as e:
        store.set(job_id, {"status": "FAILED", "error": str(e)})
        return {"status": "FAILED", "error": str(e)}

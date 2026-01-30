from celery import Celery
import os
import tempfile
import logging
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
    logger = logging.getLogger(__name__)
    logger.info("Starting generate_docx_task: %s", job_id)
    store.set(job_id, {"status": "PROCESSING"})
    try:
        # Use a shared output directory when running in docker-compose E2E. If
        # OUTPUT_DIR_BASE is set (e.g., "/shared_data"), create a per-job
        # subdirectory there so the worker's spawned containers (via host
        # Docker daemon) can mount the same host path and write outputs
        # visible to the `api` service.
        base = os.getenv("OUTPUT_DIR_BASE")
        if base:
            base_path = Path(base)
            base_path.mkdir(parents=True, exist_ok=True)
            out_dir = Path(tempfile.mkdtemp(prefix=f"docgen_{job_id}_", dir=str(base_path)))
        else:
            out_dir = Path(shutil.mkdtemp(prefix=f"docgen_{job_id}_"))

        logger.info("Running secure runner for job %s, out_dir=%s", job_id, out_dir)
        code, stdout, stderr = run_container(data_path, str(out_dir), template_docx=template_path)
        logger.info("Runner finished for job %s: code=%s", job_id, code)
        if code == 0:
            generated = out_dir / "generated.docx"
            if generated.exists():
                # store absolute host path and a download endpoint
                store.set(job_id, {"status": "COMPLETED", "output": str(generated)})
                logger.info("Job %s completed, output=%s", job_id, generated)
                return {"status": "COMPLETED", "output": str(generated)}
            else:
                logger.error("Job %s failed: no output file", job_id)
                store.set(job_id, {"status": "FAILED", "error": "No output file"})
                return {"status": "FAILED", "error": "No output file"}
        else:
            logger.error("Job %s failed with runner error: %s %s", job_id, stderr, stdout)
            store.set(job_id, {"status": "FAILED", "error": stderr or stdout})
            return {"status": "FAILED", "error": stderr or stdout}
    except RunnerError as e:
        logger.exception("RunnerError for job %s", job_id)
        store.set(job_id, {"status": "FAILED", "error": str(e)})
        return {"status": "FAILED", "error": str(e)}
    except Exception as e:
        logger.exception("Unexpected error in generate_docx_task for job %s", job_id)
        store.set(job_id, {"status": "FAILED", "error": str(e)})
        return {"status": "FAILED", "error": str(e)}


@app.task(bind=True)
def smoke_test_task(self, job_id: str, content: str):
    """Simple smoke task that writes `content` to OUTPUT_DIR_BASE/smoke_<job_id>.txt.

    This task logs the target path and UID/GID so CI logs can diagnose permission/volume issues.
    """
    logger = logging.getLogger(__name__)
    logger.info("Starting smoke_test_task: %s", job_id)
    base = os.getenv("OUTPUT_DIR_BASE")
    try:
        if not base:
            # Fall back to a temp dir so tests running outside the E2E compose don't fail silently
            tmp = tempfile.mkdtemp(prefix=f"smoke_{job_id}_")
            target = Path(tmp) / f"smoke_{job_id}.txt"
        else:
            base_path = Path(base)
            base_path.mkdir(parents=True, exist_ok=True)
            target = base_path / f"smoke_{job_id}.txt"

        logger.info("smoke_test_task running as uid=%s gid=%s, writing to %s", os.getuid(), os.getgid(), target)
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(content)

        store.set(job_id, {"status": "COMPLETED", "output": str(target)})
        logger.info("smoke_test_task completed for %s, output=%s", job_id, target)
        return {"status": "COMPLETED", "output": str(target)}
    except Exception as e:
        logger.exception("smoke_test_task failed for %s", job_id)
        store.set(job_id, {"status": "FAILED", "error": str(e)})
        return {"status": "FAILED", "error": str(e)}

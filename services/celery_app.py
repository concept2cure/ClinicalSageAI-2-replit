from celery import Celery, Task
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

# --- Reliability configuration -------------------------------------------------
# Hardening for worker crashes / lost jobs. With acks_late + reject_on_worker_lost
# a task that dies mid-flight (worker crash, OOM kill, SIGKILL) is redelivered to
# another worker instead of being silently dropped and left stuck in PROCESSING.
# prefetch_multiplier=1 keeps a worker from hoarding messages it can't ack if it
# dies. task_track_started makes the STARTED/PROCESSING state observable in the
# result backend.
app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    # Time limits sized to the heaviest task (eCTD generation in a sandboxed
    # container). The soft limit raises SoftTimeLimitExceeded so the task can
    # record a terminal FAILED state; the hard limit force-kills a hung worker
    # so the job is redelivered rather than wedged forever.
    task_soft_time_limit=600,
    task_time_limit=660,
)


class ReliableTask(Task):
    """Base task that guarantees a terminal FAILED job state on final failure.

    Celery calls on_failure() once a task has exhausted its retries (or raises a
    non-retried exception). We use it to make sure the job store reflects a
    terminal FAILED state rather than leaving the job stuck in PROCESSING.
    """

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger = logging.getLogger(__name__)
        # job_id is the first positional argument of every task here.
        job_id = None
        if args:
            job_id = args[0]
        elif kwargs:
            job_id = kwargs.get("job_id")
        if job_id is not None:
            logger.error("Task %s for job %s reached terminal failure: %s", task_id, job_id, exc)
            try:
                store.set(job_id, {"status": "FAILED", "error": str(exc)})
            except Exception:
                logger.exception("Failed to record terminal FAILED state for job %s", job_id)
        super().on_failure(exc, task_id, args, kwargs, einfo)


@app.task(
    bind=True,
    base=ReliableTask,
    # Retry only transient/infrastructure failures (e.g. container timeout,
    # Docker daemon hiccup). NonRetryableError is deliberately excluded so
    # deterministic validation failures fail fast to FAILED.
    autoretry_for=(RunnerError,),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def generate_docx_task(self, job_id: str, data_path: str, template_path: str = None):
    """Celery task to run the secure runner and update job status in the job store."""
    logger = logging.getLogger(__name__)
    logger.info("Starting generate_docx_task: %s", job_id)
    store.set(job_id, {"status": "PROCESSING"})

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
    # RunnerError (timeout / Docker unavailable) is transient: let it propagate
    # so autoretry_for=(RunnerError,) retries with backoff.
    code, stdout, stderr = run_container(data_path, str(out_dir), template_docx=template_path)
    logger.info("Runner finished for job %s: code=%s", job_id, code)

    if code == 0:
        generated = out_dir / "generated.docx"
        if generated.exists():
            # store absolute host path and a download endpoint
            store.set(job_id, {"status": "COMPLETED", "output": str(generated)})
            logger.info("Job %s completed, output=%s", job_id, generated)
            return {"status": "COMPLETED", "output": str(generated)}
        # Container exited cleanly but produced no artifact: deterministic, do
        # not retry. Record terminal FAILED and return.
        logger.error("Job %s failed: no output file", job_id)
        store.set(job_id, {"status": "FAILED", "error": "No output file"})
        return {"status": "FAILED", "error": "No output file"}

    # Non-zero exit: the generation itself failed inside the sandbox. This
    # includes the eCTD "source data required" ValueError, which is a
    # validation error that will always fail on the same input. Treat as a
    # terminal, non-retryable FAILED state instead of retrying 3x.
    err = stderr or stdout or "Generator exited non-zero"
    logger.error("Job %s failed with runner error: %s %s", job_id, stderr, stdout)
    store.set(job_id, {"status": "FAILED", "error": err})
    return {"status": "FAILED", "error": err}


@app.task(
    bind=True,
    base=ReliableTask,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def smoke_test_task(self, job_id: str, content: str):
    """Simple smoke task that writes `content` to OUTPUT_DIR_BASE/smoke_<job_id>.txt.

    This task logs the target path and UID/GID so CI logs can diagnose permission/volume issues.
    """
    logger = logging.getLogger(__name__)
    logger.info("Starting smoke_test_task: %s", job_id)
    store.set(job_id, {"status": "PROCESSING"})
    base = os.getenv("OUTPUT_DIR_BASE")

    if not base:
        # Fall back to a temp dir so tests running outside the E2E compose don't fail silently
        tmp = tempfile.mkdtemp(prefix=f"smoke_{job_id}_")
        target = Path(tmp) / f"smoke_{job_id}.txt"
    else:
        base_path = Path(base)
        base_path.mkdir(parents=True, exist_ok=True)
        target = base_path / f"smoke_{job_id}.txt"

    logger.info("smoke_test_task running as uid=%s gid=%s, writing to %s", os.getuid(), os.getgid(), target)
    # A transient filesystem error here (e.g. shared volume not yet mounted) is
    # worth retrying; autoretry_for=(Exception,) plus on_failure guarantees a
    # terminal FAILED state once retries are exhausted.
    with open(target, "w", encoding="utf-8") as fh:
        fh.write(content)

    store.set(job_id, {"status": "COMPLETED", "output": str(target)})
    logger.info("smoke_test_task completed for %s, output=%s", job_id, target)
    return {"status": "COMPLETED", "output": str(target)}

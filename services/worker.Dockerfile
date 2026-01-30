# services/worker.Dockerfile
FROM python:3.10-slim

# Install docker CLI so the worker can talk to host daemon via /var/run/docker.sock
RUN apt-get update && apt-get install -y --no-install-recommends docker.io curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy service code
COPY services /app/services
COPY services/requirements.txt /app/services/requirements.txt

# Install python deps
RUN pip install --no-cache-dir -r /app/services/requirements.txt

# Run as root so worker can access docker.sock; this is test infra only
ENV PYTHONUNBUFFERED=1

CMD ["/bin/sh", "-c", "celery -A services.celery_app worker --loglevel=info"]

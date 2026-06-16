# services/worker.Dockerfile
FROM python:3.10-slim

# Install the Docker CLI so the worker can drive the host daemon via the mounted
# /var/run/docker.sock. Use the official static client tarball rather than the
# distro's `docker.io` package, which on newer Debian bases no longer reliably
# ships the `docker` client binary (so shutil.which("docker") would be None).
# `docker --version` at the end fails the build if the binary is missing.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz -o /tmp/docker.tgz \
	&& tar -xzf /tmp/docker.tgz -C /usr/local/bin --strip-components=1 docker/docker \
	&& rm /tmp/docker.tgz \
	&& docker --version

WORKDIR /app

# Copy service code
COPY services /app/services
COPY services/requirements.txt /app/services/requirements.txt

# Install python deps
RUN pip install --no-cache-dir -r /app/services/requirements.txt

RUN addgroup --system app \
	&& adduser --system --ingroup app app \
	&& (getent group docker || addgroup --system docker) \
	&& adduser app docker
RUN chown -R app:app /app

USER app

# Ensure non-root runtime
ENV PYTHONUNBUFFERED=1

CMD ["/bin/sh", "-c", "celery -A services.celery_app worker --loglevel=info"]

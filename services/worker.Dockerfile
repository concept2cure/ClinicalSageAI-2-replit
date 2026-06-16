# services/worker.Dockerfile
FROM python:3.10-slim

# Install the Docker CLI so the worker can drive the host daemon via the mounted
# /var/run/docker.sock. The apt `docker.io` package on this slim base did not
# reliably place `docker` on PATH (the E2E failed with "Docker CLI not found in
# PATH"), so install the official static client binary into /usr/local/bin and
# verify it at build time — a broken CLI now fails the build loudly instead of
# silently at task runtime.
ARG DOCKER_CLI_VERSION=27.3.1
RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" -o /tmp/docker.tgz \
	&& tar -xzf /tmp/docker.tgz -C /tmp \
	&& mv /tmp/docker/docker /usr/local/bin/docker \
	&& chmod +x /usr/local/bin/docker \
	&& rm -rf /tmp/docker /tmp/docker.tgz \
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

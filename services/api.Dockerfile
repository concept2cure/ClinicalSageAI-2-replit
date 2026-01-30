# services/api.Dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY services /app/services
COPY services/requirements.txt /app/services/requirements.txt

RUN pip install --no-cache-dir -r /app/services/requirements.txt

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "services.api:app", "--host", "0.0.0.0", "--port", "8000"]

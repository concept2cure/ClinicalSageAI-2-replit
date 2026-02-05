# services/api.Dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY services /app/services
COPY services/requirements.txt /app/services/requirements.txt

RUN pip install --no-cache-dir -r /app/services/requirements.txt

RUN addgroup --system app && adduser --system --ingroup app app
RUN chown -R app:app /app

USER app

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "services.api:app", "--host", "0.0.0.0", "--port", "8000"]

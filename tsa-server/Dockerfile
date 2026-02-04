FROM alpine/openssl:latest
RUN apk add --no-cache python3 py3-flask py3-cryptography

RUN addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY tsa.py .
COPY certs/ /certs/

RUN chown -R app:app /app /certs
USER app

# Generate TSA certs on first run if not present
CMD ["python3", "tsa.py"]

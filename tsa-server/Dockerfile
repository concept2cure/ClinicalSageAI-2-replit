FROM alpine/openssl:latest
RUN apk add --no-cache python3 py3-flask py3-cryptography

WORKDIR /app
COPY tsa.py .
COPY certs/ /certs/

# Generate TSA certs on first run if not present
CMD ["python3", "tsa.py"]

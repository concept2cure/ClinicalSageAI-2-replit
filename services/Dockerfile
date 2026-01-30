# services/Dockerfile
FROM python:3.10-slim

# Create non-root user
RUN useradd --create-home --uid 10001 docgen

WORKDIR /app

# Copy only the generator script (keep image minimal)
COPY ectd_generator.py /app/ectd_generator.py

# Install only python-docx (keeps other libs out of the image)
RUN pip install --no-cache-dir python-docx==0.8.11

# Drop privileges
USER docgen

ENTRYPOINT ["python", "ectd_generator.py"]

# SoilAI Cloud Lab — Dockerfile
# Used for deploying the Flask backend to Google Cloud Run

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy backend files
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Set working directory to backend so relative paths work
WORKDIR /app/backend

# Expose port (Cloud Run uses 8080)
ENV PORT=8080

CMD exec gunicorn --bind :$PORT --workers 2 --threads 4 --timeout 60 app:app

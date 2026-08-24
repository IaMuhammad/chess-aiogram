# ── Stage 1: build the React frontend ───────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # produces /frontend/dist

# ── Stage 2: the Python backend (also serves the built frontend) ─────
FROM python:3.12-slim AS app
WORKDIR /app

# install backend deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# backend source
COPY app/ ./app/
COPY main.py ./

# the built frontend goes where app/main.py expects it (../frontend/dist)
COPY --from=frontend /frontend/dist ./frontend/dist

EXPOSE 8000
# one process runs the API, the WebSockets and the Telegram bot
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.lock .
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    pip install --no-cache-dir -r requirements.lock
COPY backend/ .
RUN useradd --uid 10001 --create-home mekora && mkdir -p /app/data && chown -R mekora:mekora /app
USER mekora
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m app.bootstrap && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]

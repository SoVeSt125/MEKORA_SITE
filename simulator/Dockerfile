FROM python:3.12-slim
WORKDIR /app
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    pip install --no-cache-dir httpx==0.28.1 numpy==2.4.2 scipy==1.17.1
COPY simulator/ ./simulator/
COPY backend/app/analytics/signals.py ./backend/app/analytics/signals.py
RUN useradd --uid 10001 --create-home mekora && mkdir data && chown -R mekora:mekora /app
USER mekora
CMD ["python", "-m", "simulator"]

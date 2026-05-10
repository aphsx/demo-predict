FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p models

RUN chmod +x entrypoint.sh

# DOCKER_BUILD env triggers auto-train on every container start
ENV DOCKER_BUILD=1

ENTRYPOINT ["./entrypoint.sh"]
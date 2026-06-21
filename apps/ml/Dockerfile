FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# TabICL (optional churn candidate) pulls in PyTorch. Install the CPU-only build
# by default (~200MB) instead of the CUDA build (~2.5GB of NVIDIA GPU libraries
# that are dead weight without a GPU) — same API, same results, much faster
# build. On a GPU host, rebuild with `--build-arg TORCH_VARIANT=cuda` and run the
# container with `--gpus all`; the trainer autodetects the device at runtime.
# Installed before requirements.txt so this large layer stays cached when only
# Python deps change.
ARG TORCH_VARIANT=cpu
RUN if [ "$TORCH_VARIANT" = "cpu" ]; then \
      pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu ; \
    fi

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p models
RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
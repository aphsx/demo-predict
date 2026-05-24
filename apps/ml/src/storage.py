"""
Model artifact storage — transparent R2 / local filesystem wrapper.

If R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY, and R2_SECRET_KEY are all set,
artifacts are uploaded to R2 after training and downloaded before inference.
If any var is missing, falls back to local filesystem (current Docker volume).

Usage:
  from src.storage import upload_models, sync_models

  # After training — upload all .pkl / .json artifacts
  upload_models(MODELS_DIR)

  # Before inference — ensure all artifacts are present locally
  sync_models(MODELS_DIR)
"""

import os
from pathlib import Path


# ── R2 client factory ────────────────────────────────────────────────────────

def _r2_ready() -> bool:
    return all(
        os.getenv(k) for k in ("R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY", "R2_SECRET_KEY")
    )


def _client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("R2_ENDPOINT"),
        aws_access_key_id=os.getenv("R2_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("R2_SECRET_KEY"),
        region_name="auto",
    )


def _bucket() -> str:
    return os.getenv("R2_BUCKET", "")


# ── Public API ───────────────────────────────────────────────────────────────

def upload_models(models_dir: Path) -> None:
    """Upload all .pkl and .json files in models_dir to R2.
    No-op when R2 is not configured.
    """
    if not _r2_ready():
        return

    r2 = _client()
    bucket = _bucket()
    uploaded = 0

    for pattern in ("*.pkl", "*.json", "*.txt"):
        for f in sorted(models_dir.glob(pattern)):
            try:
                r2.upload_file(str(f), bucket, f.name)
                print(f"[R2] ↑ {f.name}")
                uploaded += 1
            except Exception as e:
                print(f"[R2] Warning: failed to upload {f.name}: {e}")

    if uploaded:
        print(f"[R2] Upload complete — {uploaded} files → s3://{bucket}/")


def sync_models(models_dir: Path) -> None:
    """Download model artifacts from R2 that are not present locally.
    No-op when R2 is not configured or the bucket is empty.
    Call this before loading any model artifacts.
    """
    if not _r2_ready():
        return

    r2 = _client()
    bucket = _bucket()
    models_dir.mkdir(parents=True, exist_ok=True)

    try:
        objects = r2.list_objects_v2(Bucket=bucket).get("Contents", [])
    except Exception as e:
        print(f"[R2] Warning: could not list objects in {bucket}: {e}")
        return

    downloaded = 0
    for obj in objects:
        key: str = obj["Key"]
        local = models_dir / key
        if not local.exists():
            try:
                r2.download_file(bucket, key, str(local))
                print(f"[R2] ↓ {key}")
                downloaded += 1
            except Exception as e:
                print(f"[R2] Warning: failed to download {key}: {e}")

    if downloaded:
        print(f"[R2] Sync complete — {downloaded} files ← s3://{bucket}/")
    else:
        print(f"[R2] All artifacts already present locally")

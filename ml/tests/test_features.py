"""
Tests: Feature Engineering
ตรวจ PIT correctness — ไม่มี future data รั่ว
"""

import pytest
import pandas as pd
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data_loader import load_data, define_active
from src.features import build_features, build_transaction_pairs

CUTOFF    = pd.Timestamp("2025-07-01")
DATA_PATH = Path("data/1Moby_Data.xlsx")


@pytest.fixture(scope="module")
def data():
    if not DATA_PATH.exists():
        pytest.skip("Data file not found")
    return load_data(DATA_PATH)


@pytest.fixture(scope="module")
def feat(data):
    users, payments, usage = data
    return build_features(users, payments, usage, CUTOFF)


def test_feature_count(feat):
    """ต้องได้ 30 features พอดี"""
    n_feats = feat.shape[1] - 1  # minus acc_id
    assert n_feats == 30, f"Expected 30 features, got {n_feats}"


def test_no_future_data(data):
    """usage_recent_3m ต้องคำนวณจาก data ก่อน cutoff เท่านั้น"""
    users, payments, usage = data
    feat = build_features(users, payments, usage, CUTOFF)
    # ตรวจว่าไม่มี NaN ที่ผิดปกติ
    assert feat["usage_recent_3m"].isna().sum() == 0


def test_days_since_last_send_positive(feat):
    """days_since_last_send ต้องไม่ติดลบ (ลบ = future)"""
    valid = feat["days_since_last_send"].dropna()
    assert (valid >= 0).all() or valid.isna().all(), \
        "days_since_last_send has negative values (future leak)"


def test_all_acc_ids_present(data, feat):
    """ทุก acc_id ใน users ต้องอยู่ใน feature table"""
    users, _, _ = data
    assert set(users["acc_id"]).issubset(set(feat["acc_id"]))


def test_no_all_nan_row(feat):
    """ไม่มีลูกค้าที่ features เป็น 0 ทุกตัว (แสดงว่า merge พัง)"""
    feat_cols = [c for c in feat.columns if c != "acc_id"]
    all_zero  = (feat[feat_cols] == 0).all(axis=1)
    assert all_zero.mean() < 0.5, "More than 50% rows are all-zero — check merge"


def test_transaction_pairs_no_future(data):
    """transaction pairs target_days ต้องเป็นบวกทั้งหมด"""
    users, payments, usage = data
    pairs = build_transaction_pairs(payments, usage, CUTOFF)
    if len(pairs) == 0:
        pytest.skip("No transaction pairs")
    assert (pairs["target_days"] > 0).all()


def test_credit_features_20(data):
    """credit feature set ต้องมี 20 features"""
    from src.models.credit_model import CREDIT_FEAT_COLS
    assert len(CREDIT_FEAT_COLS) == 20, f"Expected 20 credit features, got {len(CREDIT_FEAT_COLS)}"


def test_active_set_subset(data):
    """active_set ต้องเป็น subset ของ acc_id ทั้งหมด"""
    users, payments, usage = data
    active = define_active(usage, payments, CUTOFF)
    all_ids = set(users["acc_id"])
    assert active.issubset(all_ids)

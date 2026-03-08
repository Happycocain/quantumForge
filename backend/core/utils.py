"""
Utility helpers: JSON serialization for numpy/pandas types.
"""
import math
from typing import Any

import numpy as np
import pandas as pd


def safe_float(v: Any) -> Any:
    """Convert numpy/pandas numeric to Python float; NaN/Inf → None."""
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        if math.isnan(v) or math.isinf(v):
            return None
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v


def series_to_records(s: pd.Series, value_key: str = "value") -> list:
    """Convert a DatetimeIndex Series to list of {date, <value_key>} dicts."""
    records = []
    for idx, val in s.items():
        date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
        records.append({"date": date_str, value_key: safe_float(val)})
    return records


def make_serializable(obj: Any) -> Any:
    """Recursively convert obj to JSON-safe Python types."""
    if isinstance(obj, pd.DataFrame):
        return [
            {k: safe_float(v) for k, v in row.items()}
            for _, row in obj.iterrows()
        ]
    if isinstance(obj, pd.Series):
        return series_to_records(obj)
    if isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [make_serializable(item) for item in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return safe_float(obj)
    if isinstance(obj, np.ndarray):
        return [safe_float(v) for v in obj.tolist()]
    if isinstance(obj, (pd.Timestamp,)):
        return obj.strftime("%Y-%m-%d")
    return obj

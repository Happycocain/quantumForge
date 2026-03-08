"""
Robustness Checks: Sensitivity analysis across parameter neighborhoods.

Goal: reject configs that perform well only in a narrow neighborhood (overfitting).
"""
from typing import Any, Dict, List


def sensitivity_analysis(
    all_results: List[Dict],
    metric: str = "test_sharpe",
    top_n: int = 5,
) -> List[Dict]:
    """
    For each top-N config, compare its metric to its 1-step parameter neighbors.

    A neighbor is any config that differs by exactly 1 parameter.
    Overfit warning: base_metric − avg_neighbor_metric > 0.5.
    """
    if not all_results:
        return []

    valid = [r for r in all_results if "error" not in r]
    sorted_by = sorted(valid, key=lambda x: x.get(metric, -999), reverse=True)
    top_configs = sorted_by[:top_n]

    table = []
    for cfg in top_configs:
        p0 = cfg["params"]
        neighbors = [
            r
            for r in valid
            if r["params"] != p0
            and sum(1 for k in p0 if r["params"].get(k) != p0[k]) == 1
        ]
        base = cfg.get(metric, 0.0)
        if neighbors:
            import numpy as np

            avg_nbr = float(
                __import__("numpy").mean([n.get(metric, -999) for n in neighbors])
            )
            degradation = round(base - avg_nbr, 4)
            overfit = degradation > 0.5
        else:
            avg_nbr = None
            degradation = None
            overfit = False

        table.append(
            {
                "params": p0,
                "base_metric": round(float(base), 4),
                "avg_neighbor_metric": round(float(avg_nbr), 4) if avg_nbr is not None else None,
                "degradation": degradation,
                "n_neighbors": len(neighbors),
                "overfit_warning": overfit,
            }
        )
    return table


def check_robustness(all_results: List[Dict], top_n: int = 5) -> Dict[str, Any]:
    """Run full robustness check; return sensitivity table + summary."""
    sensitivity = sensitivity_analysis(all_results, "test_sharpe", top_n)
    n_overfit = sum(1 for s in sensitivity if s.get("overfit_warning", False))
    return {
        "sensitivity_table": sensitivity,
        "overfit_warnings": n_overfit,
        "summary": f"{n_overfit}/{len(sensitivity)} top configs show potential overfitting",
    }

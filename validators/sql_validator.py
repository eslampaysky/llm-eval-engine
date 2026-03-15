from __future__ import annotations

from typing import Any, Dict

import sqlparse
from sqlparse.exceptions import SQLParseError

from .base import DeterministicValidator


class SqlValidator(DeterministicValidator):
    """
    Perform a syntax-only validation of SQL using sqlparse.
    """

    def validate(self, output: str) -> Dict[str, Any]:
        sql = output.strip()
        if not sql:
            return {
                "passed": False,
                "detail": "Empty SQL string.",
                "errors": ["Empty SQL string"],
            }

        try:
            # sqlparse focuses on parsing; errors manifest as SQLParseError
            sqlparse.parse(sql)
        except SQLParseError as exc:
            return {
                "passed": False,
                "detail": f"Invalid SQL syntax: {exc}",
                "errors": [str(exc)],
            }
        except Exception as exc:
            return {
                "passed": False,
                "detail": f"SQL validation failed: {exc}",
                "errors": [str(exc)],
            }

        return {
            "passed": True,
            "detail": "SQL syntax appears valid.",
            "errors": [],
        }


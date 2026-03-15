from __future__ import annotations

import subprocess
import sys
from typing import Any, Dict

from .base import DeterministicValidator


class PythonValidator(DeterministicValidator):
    """
    Run the given output as Python code in a subprocess with a hard timeout.
    """

    def __init__(self, timeout_seconds: float = 5.0) -> None:
        self._timeout = float(timeout_seconds)

    def validate(self, output: str) -> Dict[str, Any]:
        if not output.strip():
            return {
                "passed": False,
                "detail": "Empty Python code.",
                "stdout": "",
                "stderr": "",
                "returncode": None,
            }

        try:
            completed = subprocess.run(
                [sys.executable, "-c", output],
                input="",
                text=True,
                capture_output=True,
                timeout=self._timeout,
            )
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout or ""
            stderr = exc.stderr or ""
            return {
                "passed": False,
                "detail": f"Execution timed out after {self._timeout} seconds.",
                "stdout": stdout,
                "stderr": stderr,
                "returncode": None,
            }
        except Exception as exc:
            return {
                "passed": False,
                "detail": f"Failed to execute Python code: {exc}",
                "stdout": "",
                "stderr": "",
                "returncode": None,
            }

        passed = completed.returncode == 0
        detail = "Python code executed successfully." if passed else "Python code failed."

        return {
            "passed": passed,
            "detail": detail,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "returncode": completed.returncode,
        }


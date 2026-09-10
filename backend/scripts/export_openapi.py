"""Export the public contract without connecting to PostgreSQL."""

import json
from pathlib import Path

from appachas.main import app

target = Path(__file__).resolve().parents[1] / "openapi.json"
target.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n")

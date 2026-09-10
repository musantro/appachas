import ast
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[2] / "src" / "appachas"


def imports(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            yield node.module


def test_dependencies_point_inward_and_cross_slices_use_public_contracts():
    # Arrange / Given
    violations = []
    external = ("fastapi", "pydantic", "psycopg", "psycopg_pool", "alembic", "sqlalchemy")
    # Act / When
    for path in SOURCE.rglob("*.py"):
        relative = path.relative_to(SOURCE)
        parts = relative.parts
        for imported in imports(ast.parse(path.read_text())):
            if "domain" in parts and any(
                f".{layer}." in imported for layer in ("application", "infrastructure")
            ):
                violations.append((str(relative), imported))
            if "application" in parts and ".infrastructure." in imported:
                violations.append((str(relative), imported))
            if (
                "infrastructure" not in parts
                and path.name != "main.py"
                and imported.startswith(external)
            ):
                violations.append((str(relative), imported))
            if imported.startswith("dependency_injector") and not (
                "bootstrap" in parts or "http" in parts
            ):
                violations.append((str(relative), imported))
            if parts[:2] == ("contexts", "groups") and imported.startswith(
                "appachas.contexts.groups."
            ):
                destination = imported.split(".")
                if destination[3] not in (parts[2], "shared") and destination[-1] != "public":
                    violations.append((str(relative), imported))
    # Assert / Then
    assert violations == []


def test_composition_is_wired_once_and_shared_providers_are_thread_safe():
    # Arrange / Given
    main = ast.parse((SOURCE / "main.py").read_text())
    container = ast.parse((SOURCE / "infrastructure/bootstrap/container.py").read_text())
    # Act / When
    wire_calls = [
        n
        for n in ast.walk(main)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "wire"
    ]
    shared = [
        n.func.attr
        for n in ast.walk(container)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr.endswith("Singleton")
    ]
    # Assert / Then
    assert len(wire_calls) == 1
    assert shared and all(scope == "ThreadSafeSingleton" for scope in shared)

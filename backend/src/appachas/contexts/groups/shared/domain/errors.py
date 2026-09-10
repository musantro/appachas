class BusinessError(Exception):
    def __init__(self, code: str, detail: str, fields: dict[str, str] | None = None):
        super().__init__(code)
        self.code = code
        self.detail = detail
        self.fields = fields or {}


class InvalidInput(BusinessError):
    pass


class Forbidden(BusinessError):
    pass


class Unavailable(BusinessError):
    def __init__(self):
        super().__init__("group_unavailable", "Este grupo no está disponible.")


class Conflict(BusinessError):
    pass


def invalid(code: str, detail: str, field: str = "") -> InvalidInput:
    return InvalidInput(code, detail, {field: detail} if field else {})


def expect_version(actual: int, expected: int) -> None:
    if actual != expected:
        raise Conflict("stale_version", "Los datos han cambiado. Actualiza y vuelve a intentarlo.")

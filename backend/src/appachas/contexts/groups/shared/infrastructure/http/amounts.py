import re

from appachas.contexts.groups.shared.domain.errors import invalid


def parse_amount(value: str, *, allow_zero: bool = False) -> int:
    """Translate decimal transport text into exact integer cents before the domain."""
    clean = value.strip().replace(",", ".")
    if not re.fullmatch(r"[0-9]{1,10}(?:\.[0-9]{1,2})?", clean):
        raise invalid(
            "invalid_amount", "Introduce un importe positivo con hasta dos decimales.", "amount"
        )
    whole, _, fraction = clean.partition(".")
    cents = int(whole) * 100 + int(fraction.ljust(2, "0"))
    if cents == 0 and not allow_zero:
        raise invalid("invalid_amount", "El importe debe ser al menos 0,01 €.", "amount")
    return cents

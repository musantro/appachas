import pytest

from appachas.contexts.groups.shared.domain.errors import InvalidInput
from appachas.contexts.groups.shared.infrastructure.http.amounts import parse_amount


@pytest.mark.parametrize(
    ("value", "cents"),
    [
        ("0,01", 1),
        ("12.50", 1250),
        (" 12,5 ", 1250),
        ("100", 10000),
        ("9999999999.99", 999999999999),
    ],
)
def test_http_decimal_adapter_produces_exact_integer_cents(value, cents):
    # Arrange / Given
    entered = value
    # Act / When
    result = parse_amount(entered)
    # Assert / Then
    assert type(result) is int
    assert result == cents


@pytest.mark.parametrize(
    "value",
    [
        "0",
        "-1",
        "-0.01",
        "0.001",
        "1e2",
        "NaN",
        "inf",
        "1,000.00",
        "10000000000",
        "",
        "+1",
        ".5",
        ",01",
    ],
)
def test_http_decimal_adapter_rejects_invalid_input_without_rounding(value):
    # Arrange / Given
    entered = value
    # Act / When
    with pytest.raises(InvalidInput) as error:
        parse_amount(entered)
    # Assert / Then
    assert error.value.code == "invalid_amount"


def test_http_decimal_adapter_allows_zero_for_contribution_allocations():
    # Arrange / Given
    entered = "0,00"
    # Act / When
    result = parse_amount(entered, allow_zero=True)
    # Assert / Then
    assert result == 0

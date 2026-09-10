from dataclasses import replace
from datetime import UTC, date, datetime

import pytest

from appachas.contexts.groups.group_creation.application.handler import (
    CreateGroup,
    CreateGroupHandler,
)
from appachas.contexts.groups.shared.domain.errors import InvalidInput
from tests.mothers import FakeTokens, FrozenClock, GroupMother, MemoryRepository


def creation(**changes):
    return replace(
        CreateGroup(
            " Viaje 🌊 ",
            date(2026, 9, 10),
            date(2026, 9, 15),
            "Europe/Madrid",
            [" Ána ", "Bruno"],
            0,
        ),
        **changes,
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"name": " "},
        {"name": "a" * 21},
        {"members": ["Ana"]},
        {"members": ["Ana", " ana "]},
        {"members": ["Ana", " "]},
        {"members": ["Ana", "a" * 21]},
        {"creator_index": 2},
        {"timezone": "not/a-timezone"},
        {"start_date": date(2026, 9, 9)},
        {"end_date": date(2026, 9, 10)},
        {"start_date": date(2026, 9, 16)},
    ],
)
def test_invalid_creation_does_not_persist(changes):
    # Arrange / Given
    repository = MemoryRepository(GroupMother.with_members())
    handler = CreateGroupHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    with pytest.raises(InvalidInput):
        handler.handle(creation(**changes))
    # Assert / Then
    assert repository.commits == 0


def test_creator_is_claimed_and_tokens_are_independent():
    # Arrange / Given
    repository = MemoryRepository(GroupMother.with_members())
    handler = CreateGroupHandler(repository.unit_of_work, FrozenClock(), FakeTokens())
    # Act / When
    result = handler.handle(creation())
    # Assert / Then
    assert result.creator_token != result.member_token
    assert result.group.name == "Viaje 🌊"
    assert result.group.members[0].alias == "Ána"
    assert result.group.members[0].claimed
    assert not result.group.members[1].claimed
    assert result.group.timezone == "Europe/Madrid"


def test_creation_today_uses_creator_timezone():
    # Arrange / Given
    clock = FrozenClock(datetime(2026, 9, 9, 23, 30, tzinfo=UTC))
    handler = CreateGroupHandler(
        MemoryRepository(GroupMother.with_members()).unit_of_work, clock, FakeTokens()
    )
    # Act / When
    result = handler.handle(creation())
    # Assert / Then
    assert result.group.start_date == clock.today("Europe/Madrid")

from dependency_injector import containers, providers
from psycopg_pool import ConnectionPool

from appachas.contexts.groups.group_creation.application.handler import CreateGroupHandler
from appachas.contexts.groups.identity_claim.application.handler import ClaimIdentityHandler
from appachas.contexts.groups.identity_claim.application.session import StartSessionHandler
from appachas.contexts.groups.lifecycle.application.handlers import (
    CloseGroupHandler,
    EditGroupHandler,
    ExpireGroupsHandler,
)
from appachas.contexts.groups.member_management.application.handlers import (
    AddMemberHandler,
    DeleteMemberHandler,
    ReleaseMemberHandler,
    RenameMemberHandler,
)
from appachas.contexts.groups.movement_management.application.handlers import (
    AddMovementHandler,
    DeleteMovementHandler,
    EditMovementHandler,
)
from appachas.contexts.groups.session_migration.application.handlers import (
    AuthorizeMigrationHandler,
    ConfirmMigrationHandler,
    RedeemMigrationHandler,
    StartMigrationHandler,
)
from appachas.contexts.groups.settlement.application.handlers import (
    ReadGroupHandler,
    ReadMetadataHandler,
    ReadSettlementHandler,
)
from appachas.contexts.groups.shared.infrastructure.persistence.repository import PostgresUnitOfWork
from appachas.infrastructure.bootstrap.adapters import SecureTokens, Settings, SystemClock


class Container(containers.DeclarativeContainer):
    settings = providers.ThreadSafeSingleton(Settings.from_env)
    clock = providers.ThreadSafeSingleton(SystemClock)
    tokens = providers.ThreadSafeSingleton(SecureTokens)
    pool = providers.ThreadSafeSingleton(
        ConnectionPool,
        conninfo=settings.provided.database_url,
        min_size=0,
        max_size=4,
        open=False,
        timeout=15,
        kwargs={"autocommit": True, "prepare_threshold": None, "connect_timeout": 10},
    )
    uow = providers.Factory(PostgresUnitOfWork)
    create_group = providers.Factory(CreateGroupHandler, clock=clock, tokens=tokens)
    claim_identity = providers.Factory(ClaimIdentityHandler, clock=clock, tokens=tokens)
    start_session = providers.Factory(StartSessionHandler, clock=clock, tokens=tokens)
    start_migration = providers.Factory(
        StartMigrationHandler,
        clock=clock,
        tokens=tokens,
        source_origin=settings.provided.migration_source_origin,
        target_origin=settings.provided.migration_target_origin,
    )
    authorize_migration = providers.Factory(
        AuthorizeMigrationHandler,
        clock=clock,
        tokens=tokens,
        source_origin=settings.provided.migration_source_origin,
        target_origin=settings.provided.migration_target_origin,
    )
    redeem_migration = providers.Factory(
        RedeemMigrationHandler,
        clock=clock,
        tokens=tokens,
        source_origin=settings.provided.migration_source_origin,
        target_origin=settings.provided.migration_target_origin,
    )
    confirm_migration = providers.Factory(
        ConfirmMigrationHandler,
        clock=clock,
        tokens=tokens,
        source_origin=settings.provided.migration_source_origin,
        target_origin=settings.provided.migration_target_origin,
    )
    add_member = providers.Factory(AddMemberHandler, clock=clock, tokens=tokens)
    rename_member = providers.Factory(RenameMemberHandler, clock=clock)
    release_member = providers.Factory(ReleaseMemberHandler, clock=clock)
    delete_member = providers.Factory(DeleteMemberHandler, clock=clock)
    add_movement = providers.Factory(AddMovementHandler, clock=clock, tokens=tokens)
    edit_movement = providers.Factory(EditMovementHandler, clock=clock)
    delete_movement = providers.Factory(DeleteMovementHandler, clock=clock)
    read_metadata = providers.Factory(ReadMetadataHandler, clock=clock)
    read_group = providers.Factory(ReadGroupHandler, clock=clock)
    read_settlement = providers.Factory(ReadSettlementHandler, clock=clock)
    edit_group = providers.Factory(EditGroupHandler, clock=clock)
    close_group = providers.Factory(CloseGroupHandler, clock=clock)
    expire_groups = providers.Factory(ExpireGroupsHandler, clock=clock)

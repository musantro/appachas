# Appachas Code Architecture

## Purpose and status

This document is the normative source of truth for how Appachas is structured and
programmed. It describes the architecture that the project uses; it is not a
task list or an implementation plan.

The architecture is intentionally simple. New code follows these rules unless a
documented architectural decision records an exception.

The sources of truth are separated by concern:

- [`MVP.md`](../MVP.md) defines product behaviour and business acceptance criteria.
- [`DESIGN.md`](../DESIGN.md) defines frontend visual and accessibility standards.
- [`AGENTS.md`](../AGENTS.md) defines repository-level collaboration instructions.
- This document defines code structure, boundaries, dependencies and testing
  conventions.

Identifiers, source code, tests and technical documentation use English. The
user-facing interface and user-facing functional messages use Spanish. Domain
terms are defined in the ubiquitous language section below and are not replaced
with local synonyms in code.

## Technology decisions

| Area | Decision | Rule |
| --- | --- | --- |
| Backend runtime | Python 3.13 | Backend code uses the `backend/` project and `uv` manages dependencies. |
| HTTP backend | FastAPI | FastAPI is an infrastructure adapter, not a domain or application dependency. |
| Dependency injection | `dependency-injector` | The container composes application services and infrastructure adapters at the composition root; FastAPI `Depends` remains responsible for request-scoped HTTP dependencies. |
| Database | PostgreSQL | PostgreSQL is the production persistence boundary. |
| Database driver | Psycopg 3, synchronous API | Runtime persistence uses direct `psycopg` operations. HTTP endpoints that invoke it use regular `def` handlers. No ORM models are shared with the domain. |
| Migrations | Alembic with explicit SQL migrations | Alembic is migration tooling only; migration files contain the database schema changes explicitly. |
| Frontend | React + TypeScript + Vite | Vite produces a static build. The frontend has no server-side rendering. |
| Frontend data | React Router + TanStack Query + typed `fetch` adapter | Routing, server state and HTTP transport remain separate concerns. |
| Frontend styles | Tailwind CSS + shadcn/ui | Components and Tailwind tokens follow [`DESIGN.md`](../DESIGN.md); generated shadcn/ui code is adapted to those tokens. |
| API contract | FastAPI OpenAPI schema | TypeScript API types are generated from OpenAPI and are never edited manually. |
| Backend quality | Ruff + `ty` + pytest | Formatting, linting, type checking, behaviour tests and architecture tests are mandatory. |
| Frontend quality | Biome + Vitest + Testing Library | Formatting, linting and frontend behaviour tests are mandatory. |
| Acceptance testing | Playwright | Browser tests exercise the complete running application. |

### Serving the frontend

Production uses one container. The container builds the Vite frontend and copies
its static output into the FastAPI runtime image. FastAPI serves the API under
`/api` and serves the frontend build with `app.frontend()`.

Normal FastAPI path operations take priority over frontend files. Browser
navigation falls back to the frontend entry point so client-side routing works;
static asset requests still return `404` when the asset does not exist. FastAPI
serves already-built static files and does not perform server-side rendering.
See the [FastAPI frontend documentation](https://fastapi.tiangolo.com/tutorial/frontend/).

Local development runs Vite separately with a proxy from `/api` to FastAPI. The
production topology remains a single container even though local development
uses two processes.

## Repository structure

The repository separates the Python and TypeScript toolchains. Backend tests and
frontend tests live with their respective projects. End-to-end tests are the
intentional exception because they cross both projects.

```text
backend/
  pyproject.toml
  src/
    appachas/
      main.py
      infrastructure/
        bootstrap/
          container.py
      contexts/
        groups/
          <capability>/
            domain/
            application/
            infrastructure/
              http/
              persistence/
          shared/
            domain/
            application/
            infrastructure/
  tests/
    unit/
    integration/
    architecture/

frontend/
  package.json
  src/
    app/
    components/
    features/
    lib/
  tests/
    unit/
    component/

e2e/
  tests/

docs/
  code-architecture.md
```

The MVP currently has one bounded context: `groups`. A new bounded context gets
its own directory under `contexts/` and does not import another context's
internals.

Each backend capability is a vertical slice. A slice owns the code needed to
deliver one business capability or use case across its domain, application and
infrastructure boundaries. Typical `groups` capabilities include:

- `group_creation`
- `identity_claim`
- `member_management`
- `movement_management`
- `settlement`
- `lifecycle`

These names describe architectural ownership, not a requirement to create an
empty directory for every possible future feature. A directory exists when the
capability has code.

The `shared/` directory is a minimal Shared Kernel. Code enters it only when it
is genuinely horizontal and has a stable meaning in the bounded context. Small
duplication is preferred over a speculative shared abstraction.

## Dependency rules

The backend follows an inward dependency direction:

```text
infrastructure  --->  application  --->  domain
       |                    |             |
       +--------------------+-------------+
             allowed outward implementation dependencies
```

The allowed imports are:

| Layer | May import | Must not import |
| --- | --- | --- |
| `domain` | Python standard library, its own domain modules and approved Shared Kernel domain code | `application`, `infrastructure`, FastAPI, Pydantic, Psycopg, Alembic, `dependency_injector`, HTTP, filesystem and environment configuration |
| `application` | Python standard library, domain code, application code and approved Shared Kernel code | `infrastructure`, FastAPI, Pydantic, Psycopg, `dependency_injector`, SQL and HTTP types |
| `infrastructure` | Domain, application, infrastructure and external libraries | Nothing outside the normal dependency and security rules |

Cross-slice imports into internal modules are forbidden. Slices collaborate
through a public application contract, a port owned by the consuming layer, or
the explicitly approved Shared Kernel. They do not import another slice's
private handlers, repositories or implementation classes.

`main.py` is part of the composition root. It creates the FastAPI application,
assembles concrete adapters and includes routers. It does not contain business
rules or persistence queries.

These rules are executable. Backend architecture tests build an import graph
from the Python AST and fail when a forbidden dependency, forbidden external
library or cross-slice internal import is introduced.

### Composition root and dependency injection

Appachas uses `dependency-injector` as its application composition mechanism.
The container is created once by the infrastructure bootstrap and wires
configuration, concrete adapters and application handlers. The domain and
application layers receive their dependencies through constructors and never
import the container, providers or wiring markers.

`dependency-injector` and FastAPI `Depends` have separate responsibilities:

- `dependency-injector` builds the application object graph: repositories,
  clocks, token services, handlers and external clients;
- FastAPI `Depends` resolves HTTP/request concerns: authenticated actor,
  request data, cookies, headers and resources that must be closed at the end
  of a request;
- an HTTP adapter may bridge both systems with
  `Depends(Provide[Container.some_provider])`;
- no service is constructed by both systems. The container owns application
  services, while FastAPI owns request lifecycle and transport dependencies.

The composition root is the only place that binds ports to concrete adapters.
Use `ThreadSafeSingleton` for shared process-level objects such as a
thread-safe connection pool, `Factory` for handlers and other short-lived
application services, and an explicit lifespan or request resource for database
connections and transactions. A plain `Singleton` is not used for shared
objects in the multi-threaded HTTP process unless access is synchronized
explicitly. Each command handler defines one transaction boundary; infrastructure
enforces it and performs commit or rollback. Dependency injection never hides
those operations inside the domain.

`ThreadSafeSingleton` protects provider creation; it does not make the object
returned by the provider thread-safe. A shared object must be intrinsically
thread-safe or must not be shared.

The container holds the connection pool provider, while the FastAPI lifespan
owns startup and shutdown. Lifespan startup opens the pool and shutdown closes
it. A request-scoped FastAPI dependency acquires one connection, yields it to
the infrastructure transaction adapter and always returns or closes it. The
adapter starts one transaction around each command handler invocation and
commits or rolls back before the request-scoped dependency finishes. Repositories
participating in that command share the same connection; queries use a
short-lived read connection.

Provider scopes are explicit:

| Scope | Mechanism | Examples | Lifecycle owner |
| --- | --- | --- | --- |
| Process | `ThreadSafeSingleton` | Immutable configuration and a thread-safe connection pool | Container plus FastAPI lifespan |
| Request | FastAPI `Depends` generator | Authenticated actor, connection and request transaction | FastAPI request lifecycle |
| Handler/operation | `Factory` | Application handlers and short-lived application services | The injection site |
| Test | Fresh container or provider override | Fakes, mocks and test configuration | The test fixture |

The container is wired explicitly with `container.wire()` for the HTTP adapter
modules during application creation. It is not wired or rebuilt for every
request. Tests that wire modules unwire them during teardown, and tests that
override providers reset those overrides after the scenario.

A typical HTTP bridge has this shape:

```python
from typing import Annotated

from dependency_injector import containers, providers
from dependency_injector.wiring import Provide, inject
from fastapi import Depends


class Container(containers.DeclarativeContainer):
    # Concrete providers are declared here in the real composition root.
    # The domain and application layers do not import this class.
    claim_member_handler = providers.Factory(
        ClaimMemberHandler,
        group_repository=group_repository,
        token_service=token_service,
        clock=clock,
    )


@router.post("/claim")
@inject
def claim_member(
    request: ClaimMemberRequest,
    handler: Annotated[
        ClaimMemberHandler,
        Depends(Provide[Container.claim_member_handler]),
    ],
):
    command = request.to_command()
    result = handler.handle(command)
    return ClaimMemberResponse.from_result(result)
```

The example is illustrative; each provider is declared in the composition root
with the concrete adapters required by the slice. The `@inject` decorator is
placed immediately below the FastAPI route decorator. The container is wired
when the application is created, not for every request. Direct constructor
injection remains the preferred form inside domain and application code because
it keeps those objects easy to instantiate in isolation.

## Layer responsibilities

### Domain

The domain contains business meaning and business invariants. It uses plain
Python types and project-owned types.

The domain contains:

- aggregates and aggregate boundaries;
- entities and identity-based behaviour;
- value objects for concepts such as money in cents, dates, aliases and tokens;
- domain services when a rule does not naturally belong to one entity or
  aggregate;
- no domain events or event bus in the MVP; introducing them requires a
  documented architectural decision;
- domain exceptions for expected business rule failures;
- repository or service ports when the domain itself needs those contracts.

The domain does not know that FastAPI, PostgreSQL, Psycopg, cookies, HTTP status
codes or JSON exist. It does not parse request payloads or return HTTP
responses. Monetary rules operate on integer cents, never on binary floating
point values.

### Application

The application layer expresses what the system does. It coordinates a use case
without implementing transport or persistence details.

The application contains:

- one explicit handler per command or query;
- command and query input/output types independent of Pydantic;
- application policies such as actor permissions and use-case orchestration;
- ports for repositories, clocks, token services and other required boundaries;
- application exceptions for failures that are meaningful at use-case level.

Commands change state. Queries read state and do not mutate it. The MVP uses
explicit handlers and does not introduce a command bus or query bus.

Each command handler defines one database transaction. The infrastructure
transaction adapter commits only after the complete command succeeds and rolls
back when an expected or unexpected exception leaves the handler.

### Infrastructure

Infrastructure adapts the application to external technology.

Infrastructure contains:

- FastAPI routers and HTTP controllers under `infrastructure/http`;
- Pydantic request and response models;
- translation between HTTP DTOs and application commands/queries;
- Psycopg repositories, SQL statements and database row mappers under
  `infrastructure/persistence`;
- connection and transaction lifecycle management;
- concrete clock, token, cookie and scheduler adapters;
- configuration loading, logging, error mapping and composition wiring through
  `infrastructure/bootstrap/container.py`;
- `dependency-injector` providers that bind application ports to concrete
  infrastructure implementations.

Infrastructure may depend on every inner layer, but inner layers never import
infrastructure to obtain a concrete implementation.

## Contracts between layers

Application and domain contracts use project-owned Python types and
`typing.Protocol` where structural typing is useful. Pydantic models stop at the
HTTP boundary.

The normal request flow is:

1. The FastAPI adapter parses and validates the request with a Pydantic model.
2. The adapter maps the request to an application command or query.
3. The handler loads state through a port and invokes domain behaviour.
4. A command handler persists the result through ports in one transaction.
5. The adapter maps the application result to a response DTO.
6. One central error handler maps expected exceptions to the public error
   contract.

The normal query flow uses a read-oriented application port and does not load
HTTP or database models into the domain. Read models are response projections,
not domain entities.

Repository interfaces are defined beside the layer that needs them. A
repository used by domain behaviour belongs to domain; a repository used only
to orchestrate an application query belongs to application. If a contract
becomes horizontal, it is moved deliberately into the Shared Kernel rather than
duplicated through uncontrolled imports.

The frontend consumes the generated OpenAPI types through one HTTP adapter. UI
components do not construct URLs, inspect raw response shapes or duplicate
backend business calculations. TanStack Query owns server-state loading,
cache invalidation and request lifecycle; React components own presentation and
user interaction.

## Vertical slicing rules

New backend behaviour is added to the smallest capability slice that owns the
business decision. A change is not split into global `domain/`, `application/`
and `infrastructure/` folders.

For example, adding a movement follows this shape:

```text
contexts/groups/movement_management/
  domain/
    movement.py
    movement_type.py
    movement_errors.py
  application/
    add_movement/
      command.py
      handler.py
    edit_movement/
      command.py
      handler.py
  infrastructure/
    http/
      add_movement.py
      edit_movement.py
    persistence/
      movement_repository.py
      movement_mapper.py
```

The example is illustrative: a file is created only when the capability needs
it. A handler owns orchestration, an aggregate owns state transitions and
invariants, and the adapter owns translation to and from external formats.

Validation follows the same boundary rule:

- syntactic and transport validation belongs to the HTTP adapter;
- use-case permissions and orchestration belong to application;
- business invariants belong to domain;
- database constraints and retry/rollback mechanics belong to infrastructure.

Concurrency is part of the infrastructure contract without moving business
rules into SQL. Identity claims are atomic and protected by PostgreSQL
constraints and locking or conditional updates. Movement edits use an expected
version; an update that does not match the expected version becomes a typed
conflict and returns `409 Conflict`.

Group expiry is an idempotent application command. A scheduler outside the HTTP
process invokes it. The FastAPI process does not rely on an in-process recurring
task for data deletion.

## Error handling

Expected failures use typed domain or application exceptions. Code never raises
`HTTPException` from domain or application. HTTP translation happens once in
the infrastructure error handler, following the centralized exception-to-status
mapping approach used in CodelyTV examples. See the [CodelyTV hexagonal
architecture plugin](https://github.com/CodelyTV/eslint-plugin-hexagonal-architecture)
and [CodelyTV PHP DDD example](https://github.com/CodelyTV/php-ddd-example).

The API uses RFC 9457 Problem Details with stable project extensions:

```json
{
  "type": "https://appachas.dev/problems/member-already-claimed",
  "title": "Conflict",
  "status": 409,
  "detail": "Este integrante ya está ocupado",
  "code": "member_already_claimed",
  "fields": {}
}
```

`code` is stable, documented in English and is the only field the frontend uses
for programmatic decisions. `detail` is a Spanish fallback for presentation.
`fields` is optional and contains field-level errors when a form can act on
them. The frontend may replace `detail` with a localized message selected by
`code`; it never branches on human-readable text.

The default mapping is:

| Failure | HTTP status | Behaviour |
| --- | ---: | --- |
| Malformed or semantically invalid input | 422 | The response identifies the relevant fields when possible. |
| Forbidden operation for the current member | 403 | No implementation detail is exposed. |
| Invalid, closed or expired group access | 404 | The API intentionally does not distinguish unavailable-link causes. |
| Concurrent claim or stale movement version | 409 | The client can refresh or return to the selector. |
| Unexpected exception | 500 | The client receives a generic Problem Details response; the server logs the cause. |

FastAPI validation errors are normalized into this same contract. Infrastructure
logs unexpected failures with enough context to diagnose them, but never sends
stack traces, raw SQL, tokens or secrets to the client.

## Security and sessions

Appachas has no user accounts or passwords. Access is based on high-entropy,
opaque random tokens. Raw access tokens are not stored in PostgreSQL; only a
one-way hash is persisted for lookup and revocation by group deletion.

After a successful identity claim, the backend issues the persistent session
credential through an HttpOnly cookie. In production the cookie is Secure and
uses `SameSite=Strict`. State-changing requests validate the request origin via
`Origin` or `Referer`. The frontend and API use the same origin in production.

Token creation, hashing, lookup, cookie handling and origin checks are
infrastructure concerns. Domain and application code receive an already
authenticated actor or a domain-level identity, never a cookie or raw HTTP
request.

Logs and test output never contain raw link tokens, session cookies or other
credentials. Rate limiting, payload limits and other abuse controls remain
infrastructure concerns and follow the requirements in [`MVP.md`](../MVP.md).

## Ubiquitous language

The following English terms are canonical in code, tests and technical
documentation:

| Term | Meaning | Do not use as a synonym |
| --- | --- | --- |
| `Group` | An ephemeral collection of members and movements with a lifecycle | `Trip`, `Account`, `Workspace` |
| `Member` | A person represented by an identity inside a group | `User` when no account exists |
| `Creator` | The member with private group-management authority | `Admin` unless the context explicitly requires it |
| `Claim` | The atomic act of associating a device/session with a member identity | `Login`, `Registration` |
| `Movement` | The umbrella concept for expense, refund and contribution | `Payment`, `Transaction` |
| `Expense` | A positive user-entered expense represented as a signed movement | `Charge` |
| `Refund` | A positive user-entered refund represented as a negative movement | `Reversal` |
| `Contribution` | A direct transfer between members that changes outstanding balances | `Expense`, `Settlement` |
| `Balance` | A member's net amount after all applicable movements and contributions | `Total` |
| `Settlement` | The residual payments proposed to clear balances | `Contribution`, `Transfer` |
| `Member link` | The common access link used by group members | `Public token` |
| `Creator link` | The private group-management access link | `Admin link` |
| `Expiry` | Automatic removal of an unavailable group under lifecycle rules | `Archive`, `Soft delete` |

The product copy remains Spanish. The translation boundary is the frontend;
the backend exposes stable English error codes and Spanish fallback details.
Business definitions and examples remain in [`MVP.md`](../MVP.md).

## Testing conventions

### Test categories

Test names and scenarios use English. Each test has one clear subject and one
observable reason to exist.

| Category | Definition | Allowed dependencies | Runs |
| --- | --- | --- | --- |
| Unit | Verifies domain or application behaviour without external I/O | Plain objects, Object Mothers, fakes and mocks of ports | Every pull request |
| Integration | Verifies infrastructure adapters only | Ephemeral PostgreSQL and real Alembic migrations for persistence tests | Deployment pipeline |
| Acceptance | Verifies product behaviour through the running application | Browser, HTTP and the complete backend/frontend stack | Deployment pipeline |
| Architecture | Verifies structural standards rather than business behaviour | Repository source tree and Python AST/import graph | Every pull request |

A unit test may exercise several objects from domain and application when they
form one use-case boundary, but it never opens a database, starts FastAPI or
depends on a network service. An integration test does not re-test domain rules;
it verifies that infrastructure correctly persists, retrieves, maps and
transacts data. An acceptance test does not assert private classes or database
rows; it observes the same behaviour a user observes.

### Object Mothers and Arrange–Act–Assert

Object Mothers create valid domain examples with explicit, meaningful defaults.
They expose named overrides for the part of a scenario that matters. They do
not hide the business action being tested and they do not become a generic
fixture bag.

Every scenario is written with visible Arrange–Act–Assert sections. These map to
the requested Given–When–Then reasoning:

- Arrange / Given establishes the initial context, normally with an Object
  Mother.
- Act / When performs one business action.
- Assert / Then verifies the observable outcome, state change or emitted error.

The Act section contains one primary action. Assertions describe behaviour and
do not duplicate implementation details. A test that needs a second unrelated
action is split into another scenario.

```python
def test_rejects_an_alias_already_used_by_another_member():
    # Arrange / Given
    given_group = GroupMother.with_members("Ana", "Bruno")
    given_alias = "Ana"

    # Act / When
    actual_error = claim_member(given_group, alias=given_alias)

    # Assert / Then
    assert actual_error.code == "member_alias_already_used"
```

The example shows the convention; production tests use the actual domain
boundary and keep Object Mother defaults explicit enough to understand the
scenario.

### Test placement

Backend tests live under `backend/tests` and mirror bounded contexts and slices:

```text
backend/tests/
  unit/contexts/groups/<capability>/
  integration/contexts/groups/<capability>/
  architecture/
```

Frontend unit and component tests live under `frontend/tests`. Full browser
acceptance tests live under `e2e/tests` because they cross the frontend and
backend projects.

### Architecture tests

Architecture tests are intentionally separate from business tests. They use a
small AST/import-graph checker owned by the repository and assert:

- `domain` has no dependency on `application` or `infrastructure`;
- `application` has no dependency on `infrastructure`;
- FastAPI, Pydantic, Psycopg and Alembic imports occur only in infrastructure or
  migration tooling;
- `dependency_injector` imports in production code occur only in infrastructure
  bootstrap and HTTP adapters;
- cross-slice internal imports do not exist;
- composition remains in the infrastructure bootstrap and the application is
  wired once during startup;
- provider scopes match the documented process, request, operation and test
  lifecycles, and request resources are released after success and failure;
- the expected `domain`, `application` and `infrastructure` directories exist
  only where the slice actually has that responsibility.

These tests verify architecture only. They do not validate a balance,
settlement amount or HTTP response body.

## Quality gates

The repository exposes separate fast and environment-dependent suites.

### Pull request gate

Every pull request runs:

- Ruff linting and formatting checks;
- `ty` type checking;
- Biome formatting and linting;
- backend unit tests;
- dependency-injection bootstrap and lifecycle tests using fake providers;
- frontend Vitest and Testing Library tests;
- backend architecture tests;
- OpenAPI type regeneration and a clean-diff check when the API contract is
  involved.

### Deployment gate

Before deployment, the pipeline starts the required PostgreSQL and application
environment, applies Alembic migrations, and runs:

- backend infrastructure integration tests against ephemeral PostgreSQL;
- Playwright acceptance tests against the complete built application;
- a production-style check that FastAPI serves both `/api` and the frontend
  build from the same container.

Integration and acceptance failures block deployment. They are not required for
the fast pull-request feedback loop because they require external processes and
the built runtime.

## New-change checklist

Before merging a change, the author confirms:

- The change belongs to one bounded context and the smallest owning capability.
- New code is in the correct layer and does not bypass a port.
- Domain code remains framework- and infrastructure-free.
- Commands, queries, DTOs and handlers have one clear responsibility.
- Cross-slice collaboration uses a public contract or the approved Shared
  Kernel, never another slice's internals.
- Business errors are typed and mapped centrally; code does not branch on
  human-readable error text.
- State-changing commands have one transaction boundary and concurrency rules
  are explicit.
- New domain scenarios use Object Mothers and Arrange–Act–Assert.
- The test category matches the boundary being verified.
- Frontend components follow [`DESIGN.md`](../DESIGN.md) and do not duplicate
  backend business calculations.
- OpenAPI-derived frontend types are regenerated rather than edited manually.
- New application services and adapters are registered in the composition root;
  domain and application code never imports `dependency_injector`.
- HTTP adapters use `Depends` for request concerns and `Provide` only to bridge
  to a container provider; they do not create application services directly.
- Shared providers use only the documented scope, and request-scoped resources
  are closed on both successful and failing requests.
- The applicable quality gates pass.

## References

- [Product requirements](../MVP.md)
- [Frontend design system](../DESIGN.md)
- [FastAPI frontend serving](https://fastapi.tiangolo.com/tutorial/frontend/)
- [Dependency Injector FastAPI example](https://python-dependency-injector.ets-labs.org/examples/fastapi.html)
- [Dependency Injector wiring](https://python-dependency-injector.ets-labs.org/wiring.html)
- [Psycopg 3 basic usage](https://www.psycopg.org/psycopg3/docs/basic/usage.html)
- [Psycopg 3 transaction management](https://www.psycopg.org/psycopg3/docs/basic/transactions.html)
- [CodelyTV hexagonal architecture ESLint plugin](https://github.com/CodelyTV/eslint-plugin-hexagonal-architecture)
- [CodelyTV TypeScript DDD example](https://github.com/CodelyTV/typescript-ddd-example)
- [CodelyTV PHP DDD example](https://github.com/CodelyTV/php-ddd-example)

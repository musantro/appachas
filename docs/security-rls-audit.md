# APP-5 — Revisión de RLS y superficies de acceso

**Fecha de revisión:** 2026-09-30

**Alcance:** rama `APP-5`, comprobaciones HTTP anónimas contra producción y
catálogo remoto de Supabase mediante el endpoint oficial de consultas de solo
lectura. La consulta se ejecutó como `supabase_read_only_user`, con
`transaction_read_only=on`; no leyó filas de negocio, hashes ni datos
personales.

## Resultado ejecutivo

- Producción contiene las seis tablas esperadas en `appachas`: `groups`,
  `members`, `movements`, `movement_allocations`, `sessions` y
  `session_migrations`. Todas tienen RLS habilitado, ninguna fuerza RLS y todas
  pertenecen a `postgres`.
- `anon`, `authenticated`, `authenticator` y `service_role` no tienen `USAGE`
  sobre `appachas` ni privilegios de tabla sobre esos seis objetos. No existen
  vistas, rutinas ni políticas en `appachas` o `public`.
- Una petición real a `/api/health` dejó una conexión `postgres` con
  `application_name=Supavisor`. `postgres` es propietario y tiene `BYPASSRLS`,
  por lo que RLS no protege el acceso del backend. La autorización de grupos se
  aplica deliberadamente en la aplicación mediante enlaces y sesiones.
- Se encontró una superficie distinta y accionable: `public.alembic_version`
  tenía RLS desactivado y CRUD concedido a `anon`, `authenticated` y
  `service_role` por los privilegios predeterminados de Supabase para `public`.
- La migración `0006` habilita RLS en `public.alembic_version`, revoca todos sus
  privilegios públicos y de roles Data API, y endurece los privilegios
  predeterminados de tablas `public` creadas por el rol de migración.

No se añaden políticas de usuario final a `appachas`: esos roles no pueden
alcanzar el esquema y el backend no aporta identidad PostgreSQL/JWT por grupo.
Una política inventada no se ejecutaría para el rol real y daría una falsa
sensación de aislamiento.

## Inventario y sensibilidad

| Objeto | Datos o función | Acceso esperado |
| --- | --- | --- |
| `appachas.groups` | nombre, fechas, zona horaria, hashes de enlaces | backend autorizado |
| `appachas.members` | alias, orden, hashes de sesión | backend autorizado |
| `appachas.movements` | conceptos, importes, fechas y pagador | backend autorizado |
| `appachas.movement_allocations` | reparto por miembro | backend autorizado |
| `appachas.sessions` | hashes, rol y revocación | backend autorizado |
| `appachas.session_migrations` | hashes, orígenes y caducidad | backend autorizado |
| `public.alembic_version` | versión de migración | Alembic durante despliegues |

No se encontraron vistas, funciones ni procedimientos en `appachas` o
`public`, ni en el repositorio ni en el catálogo remoto.

## Modelo de seguridad efectivo

Las migraciones `0001`, `0003` y `0005` habilitan RLS en las tablas de
`appachas` y revocan acceso de `PUBLIC`. El catálogo remoto confirma además que
los roles Data API carecen de acceso al esquema y a sus tablas. RLS sin
políticas aplica denegación por defecto a roles sujetos a RLS y funciona aquí
como segunda barrera para objetos que no deben publicarse.

El backend usa `postgres` a través de Supavisor. Ese rol es propietario de las
tablas y tiene `BYPASSRLS`; por tanto, las reglas creador/miembro se aplican en
FastAPI y no en PostgreSQL. Migrarlas a RLS exigiría primero un rol runtime no
propietario y un contexto transaccional fiable de identidad por grupo.

`public.alembic_version` era la excepción. Los privilegios predeterminados de
Supabase para objetos `public` concedían CRUD a los roles Data API. Aunque la
tabla no contiene datos de negocio, su modificación podría falsear el estado de
migraciones. `0006` corrige el objeto existente y evita que el rol de migración
repita ese patrón al crear futuras tablas en `public`.

## Evidencia remota read-only

| Comprobación | Resultado |
| --- | --- |
| Identidad de auditoría | `supabase_read_only_user`; transacción read-only |
| Objetos `appachas` | 6 tablas; RLS activo; `FORCE` desactivado; owner `postgres` |
| Políticas y rutinas | ninguna en `appachas` o `public` |
| Acceso Data API a `appachas` | sin `USAGE` ni CRUD para roles Data API |
| Rol tras `/api/health` | `postgres`, aplicación `Supavisor` |
| Atributos de `postgres` | propietario y `BYPASSRLS=true` |
| Hallazgo público | `public.alembic_version`, RLS inactivo y CRUD Data API antes de `0006` |

Consultas reproducibles de catálogo, sin filas de negocio:

```sql
SELECT current_database(), current_user,
       current_setting('transaction_read_only');

SELECT n.nspname AS schema_name,
       c.relname AS object_name,
       c.relkind,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('appachas', 'public')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY 1, 2;

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname IN ('appachas', 'public')
ORDER BY schemaname, tablename, policyname;

SELECT routine_schema, routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_schema IN ('appachas', 'public')
ORDER BY 1, 2;

SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolreplication,
       rolbypassrls
FROM pg_roles
WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role');
```

## Matriz de autorización de aplicación

| Caso | Resultado esperado | Evidencia automatizada |
| --- | --- | --- |
| Anónimo sin enlace | denegado, sin grupo | `/api/group` y `/api/group/metadata` devuelven `404 group_unavailable` |
| Creador con enlace válido | metadata y sesión de creador | `test_creator_link_issues_independent_session_and_cookie_access_needs_no_link` |
| Miembro válido sin reclamar | metadata/claim, sin sesión operativa | `test_member_link_cannot_issue_session_without_claim` |
| Miembro reclamado | permitido como actor válido | `test_member_link_recovers_only_existing_claim_without_returning_credential` |
| Usuario sin pertenencia | denegado | `test_group_reference_without_link_or_session_cannot_claim_identity` |
| Sesión revocada | denegado | `test_revoked_creator_session_does_not_authorize_operations` |
| Sesión de otro grupo | denegado | `test_session_cannot_be_replayed_for_different_group` |
| Enlace/migración caducado | denegado | pruebas de `session_migration` |
| Metadata de Alembic | sin acceso público/Data API | `test_alembic_metadata_is_not_exposed_by_default` |

Las pruebas de PostgreSQL cubren además constraints, cascadas, concurrencia,
revocación persistida y handoffs atómicos. No se creó ningún grupo ni se leyó
ninguna fila de negocio en producción durante esta auditoría.

## Revisión recurrente

OpenClaw mantiene dos revisiones y ambas estaban operativas al cerrar esta
auditoría:

- `appachas-nightly-security`: diaria a las 05:00 Europe/Madrid; última
  ejecución `ok`.
- `appachas-weekly-invasive-security`: lunes a las 03:00 Europe/Madrid; última
  ejecución `ok`.

La revisión recurrente debe:

1. comparar migraciones con `pg_class`, `pg_policies` y privilegios efectivos;
2. alertar ante nuevas tablas, vistas o rutinas en esquemas expuestos;
3. confirmar el rol runtime, propietarios y `BYPASSRLS`;
4. verificar anónimamente `/api/health`, `/api/group` y `/api/group/metadata`;
5. ejecutar la matriz de autorización en una base aislada, nunca creando datos
   de producción.

## Riesgo residual y siguientes pasos

1. Aplicar `0006` mediante el pipeline normal y repetir la consulta remota para
   confirmar RLS y ausencia de privilegios Data API en `alembic_version`.
2. Mantener las pruebas de autorización de aplicación como barrera principal y
   la auditoría de catálogo/grants como detección de regresiones.
3. Evaluar separadamente un rol runtime no propietario con privilegios mínimos.
   Reduciría el impacto de una inyección SQL, pero requiere diseño y pruebas
   propios.
4. Si Appachas no va a usar la Data API, valorar desactivarla en Supabase. Es un
   cambio operativo de producción y queda fuera de esta PR.

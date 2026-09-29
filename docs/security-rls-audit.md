# APP-5 — Revisión de RLS y superficies de acceso

**Fecha de revisión:** 2026-09-29

**Alcance:** checkout local de Appachas, rama `APP-5`, y comprobaciones HTTP
anónimas contra `https://appachas.es`. No se leyeron datos de grupos ni datos
personales de producción.

## Resultado ejecutivo

- El repositorio declara seis tablas en `appachas`: `groups`, `members`,
  `movements`, `movement_allocations`, `sessions` y `session_migrations`.
- Las migraciones habilitan RLS en las seis tablas y revocan los privilegios de
  `PUBLIC`, pero no declaran ninguna `CREATE POLICY`.
- El backend usa una conexión directa a PostgreSQL y aplica la autorización en
  la aplicación mediante hashes de enlaces y sesiones. No establece un
  contexto PostgreSQL/JWT que permita escribir políticas correctas con la
  información disponible.
- No hay declaraciones de vistas, funciones ni procedimientos SQL en el
  repositorio. La existencia de objetos adicionales en el proyecto Supabase
  remoto sigue sin verificarse porque este checkout no tiene Supabase CLI,
  cliente `psql` ni `DATABASE_URL`.
- **No se aplicó una migración de políticas.** Crear políticas genéricas o
  activar `FORCE ROW LEVEL SECURITY` sin conocer el rol de runtime, sus
  privilegios y el contexto de sesión podría bloquear el backend o abrir datos.

La issue debe permanecer abierta para la verificación remota y el diseño de
políticas con evidencia del rol efectivo.

## Inventario del repositorio

| Objeto | Datos sensibles | Acceso de aplicación | Riesgo si la conexión evita RLS |
| --- | --- | --- | --- |
| `groups` | nombre, fechas, zona horaria, hashes de enlaces | enlace de creador/miembro o sesión por `group_id` | exposición del grupo completo y de hashes |
| `members` | alias, orden, `session_hash` | se carga junto al grupo autorizado | exposición de identidades y hashes |
| `movements` | conceptos, importes, fechas, pagador | sesión válida del grupo | exposición de actividad financiera |
| `movement_allocations` | reparto de importes por miembro | se carga junto a los movimientos | exposición del reparto financiero |
| `sessions` | hashes de sesiones, rol, revocación | solo la aplicación crea/revoca/consulta | exposición de credenciales derivadas |
| `session_migrations` | hashes de binding/código, orígenes, caducidad | flujo de migración con binding de 120 s | exposición de handoffs entre dominios |

No se encontraron `CREATE VIEW`, `CREATE FUNCTION` ni `CREATE PROCEDURE` en
las migraciones o scripts. Esto es un inventario de código, no una afirmación
sobre el catálogo remoto.

## RLS y privilegios declarados

`backend/migrations/versions/0001_initial.py` habilita RLS en las cuatro tablas
base y revoca `ALL` del esquema y de sus tablas para `PUBLIC`. Las migraciones
`0003_sessions.py` y `0005_session_migrations.py` repiten la revocación y
habilitan RLS en sus tablas nuevas. No hay `CREATE POLICY`, `ALTER TABLE ...
FORCE ROW LEVEL SECURITY`, `GRANT` de runtime ni `ALTER DEFAULT PRIVILEGES`.

RLS sin políticas no constituye una autorización de filas para roles con
privilegios de tabla. Además, el propietario de una tabla normalmente evita
RLS salvo que se fuerce, y un rol con `BYPASSRLS` siempre lo evita. Hay que
confirmar esto en el proyecto enlazado antes de decidir si el modelo debe
seguir siendo autorización en la aplicación o migrar a un rol no propietario
con contexto de sesión.

### Consulta remota de verificación (solo lectura)

Ejecutar desde un entorno con acceso de administración de solo lectura, sin
copiar la URL ni resultados con datos de negocio al chat:

```sql
SELECT current_database(), current_user;

SELECT n.nspname AS schema_name,
       c.relname AS object_name,
       c.relkind,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY 1, 2;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'appachas'
ORDER BY tablename, policyname;

SELECT routine_schema, routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1, 2;

SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname = current_user;

SELECT table_schema, table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE table_schema = 'appachas'
ORDER BY table_name, grantee, privilege_type;
```

La evidencia mínima para cerrar el bloqueo es: catálogo de las seis tablas,
resultado de `pg_policies`, rol usado por el backend, `rolbypassrls`, si ese rol
es propietario, y privilegios efectivos. Los resultados deben omitir filas de
negocio, hashes y valores de secretos.

## Modelo de acceso y matriz de regresión

La autorización de negocio está separada de la existencia del `group_id`:

- Un enlace de creador permite resolver el grupo y emitir una sesión de
  creador; la sesión posterior no depende de conservar el enlace.
- Un enlace de miembro permite obtener metadatos y reclamar una identidad,
  pero no emite sesión para un miembro no reclamado.
- Una sesión válida se comprueba contra `sessions`, `members`, grupo, rol y
  revocación; no puede reutilizarse en otro grupo.
- Un `group_id` sin enlace/sesión no concede acceso operativo.
- Enlaces inválidos, grupos cerrados o grupos expirados se presentan como
  `group_unavailable`/404 para no revelar la causa exacta.
- Las migraciones entre dominios exigen origen exacto, binding de cookie,
  código de un solo uso y caducidad de 120 segundos.

| Caso | Resultado esperado | Evidencia |
| --- | --- | --- |
| Anónimo sin enlace | denegado, sin grupo | `/api/group` y `/api/group/metadata` públicos devolvieron `404 group_unavailable` |
| Creador con enlace válido | permitido para metadata y sesión de creador | `test_creator_link_issues_independent_session_and_cookie_access_needs_no_link` |
| Miembro con enlace válido sin reclamar | metadata/claim, no sesión operativa | `test_member_link_cannot_issue_session_without_claim` |
| Miembro reclamado | permitido solo como actor válido | `test_member_link_recovers_only_existing_claim_without_returning_credential` |
| Usuario sin pertenencia | denegado | `test_group_reference_without_link_or_session_cannot_claim_identity` |
| Sesión revocada | denegado | `test_revoked_creator_session_does_not_authorize_operations` y `test_releasing_identity_revokes_session_access` |
| Sesión de otro grupo | denegado | `test_session_cannot_be_replayed_for_different_group` |
| Enlace/migración caducada o ya usada | denegado | `backend/tests/unit/contexts/groups/session_migration/test_migration.py` |

Las pruebas de PostgreSQL cubren además constraints, cascadas, concurrencia,
revocación persistida y handoffs atómicos. No se ejecutó un flujo E2E que cree
grupos en producción durante esta revisión.

## Limpieza recurrente y revisión

El cron de aplicación está declarado en `vercel.json`:

```json
{"path":"/api/internal/expire","schedule":"0 3 * * *"}
```

El endpoint solo acepta `Authorization: Bearer <CRON_SECRET>` y elimina
grupos expirados y migraciones caducadas. La configuración está presente en el
checkout; no se probó el secreto contra producción.

En OpenClaw ya existen dos revisiones de Appachas en el host:

- `appachas-nightly-security`: diaria a las 05:00 Europe/Madrid; al consultar
  el estado tenía `error (2x)` por una pérdida de lease de binding.
- `appachas-weekly-invasive-security`: lunes a las 03:00 Europe/Madrid; la
  última ejecución observada estaba en estado `ok`.

La revisión recurrente debe ejecutar únicamente comprobaciones no destructivas:

1. comparar el inventario de migraciones con `pg_class` y `pg_policies`;
2. comprobar el rol efectivo, propietario y `rolbypassrls`;
3. verificar anónimamente `/api/health`, `/api/group` y
   `/api/group/metadata`;
4. ejecutar la matriz de autorización en una base aislada, nunca creando datos
   en producción;
5. alertar si aparece una tabla/vista/función nueva, un `GRANT` inesperado,
   desaparece RLS o falla la automatización.

La automatización diaria necesita reparación del binding antes de considerarse
operativa para APP-5. No se modificó el scheduler desde este checkout.

## Bloqueos y siguiente paso seguro

1. Obtener, mediante el canal de secretos del host, una conexión válida de
   solo lectura al proyecto Supabase enlazado; no pegarla en issues, logs ni
   chat.
2. Ejecutar las consultas anteriores y conservar solo el inventario sin datos.
3. Si el runtime es propietario/BYPASSRLS, decidir explícitamente entre
   mantener la autorización de aplicación con privilegios mínimos o diseñar un
   rol no propietario y un contexto transaccional de sesión.
4. Solo después escribir políticas específicas para creador, miembro válido,
   enlace inválido/expirado y usuario sin pertenencia, probarlas con roles
   reales en una base aislada y verificar regresiones.

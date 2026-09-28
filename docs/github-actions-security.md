# GitHub Actions y protección de producción

## Cambios aplicados en el repositorio

Todas las acciones de terceros del pipeline están fijadas a commits completos,
con el tag de referencia conservado en un comentario para facilitar la revisión:

| Acción | Tag revisado | SHA fijado |
| --- | --- | --- |
| `actions/checkout` | `v4.3.1` | `34e114876b0b11c390a56381ad16ebd13914f8d5` |
| `actions/setup-node` | `v4.4.0` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `astral-sh/setup-uv` | `v6.8.0` | `d0cc045d04ccac9d8b7881df0226f9e82c39688e` |

La comprobación recurrente [`security-controls.yml`](../.github/workflows/security-controls.yml)
se ejecuta semanalmente y bajo demanda. Verifica el pinning y consulta la
configuración remota de Actions, el entorno `production` y la protección de
`master`. Usa únicamente permisos de lectura y no recibe credenciales de
producción. Para consultar las reglas administrativas, el equipo debe
configurar el secreto `SECURITY_AUDIT_TOKEN` con una credencial de solo lectura
adecuada; el valor nunca se guarda en el repositorio ni se imprime en los logs.

## Configuración remota pendiente

La API de GitHub debe quedar configurada así:

| Control | Configuración requerida |
| --- | --- |
| Actions | `allowed_actions=selected`; allowlist exacta `actions/checkout`, `actions/setup-node`, `astral-sh/setup-uv`; SHA pinning obligatorio |
| `master` | PR obligatorio, al menos una aprobación, checks `quality` y `acceptance` requeridos, push directo restringido, sin force-push ni borrado y reglas aplicables también a administradores |
| `production` | al menos un reviewer requerido y política de despliegue limitada explícitamente a `master` |
| Vercel | token limitado al proyecto Appachas; rotar credenciales si existe evidencia de compromiso |

Estas modificaciones requieren permisos administrativos y decisión del equipo.
No se aplican desde una sesión de implementación. La auditoría debe permanecer
fallando hasta que los controles se configuren; eso mantiene visible el riesgo
en lugar de convertir un estado inseguro en un falso positivo.

## Evidencia de la revisión remota inicial

Consulta de solo lectura realizada el 2026-09-28 UTC:

- `GET /repos/musantro/appachas/actions/permissions`: `allowed_actions=all` y `sha_pinning_required=false`.
- `GET /repos/musantro/appachas/environments/production`: sin `protection_rules` ni `deployment_branch_policy`.
- `GET /repos/musantro/appachas/branches/master/protection`: `404 Branch not protected`.

Tras aplicar los controles, ejecutar de nuevo la auditoría y conservar el
resultado exitoso junto con la revisión de los SHAs antes de cerrar APP-17.

# Algoritmos de reparto, balance y compensación

Este documento es la fuente normativa de las reglas matemáticas de Appachas.
Las reglas de producto que determinan cuándo puede crearse o modificarse un
movimiento están en [MVP.md](../MVP.md), especialmente en [Balances y
liquidación](../MVP.md#5-balances-y-liquidación). La separación de estas reglas
respecto de HTTP y de la persistencia sigue
[`code-architecture.md`](code-architecture.md).

La aplicación trabaja exclusivamente con enteros en céntimos de EUR. Nunca se
usan números de coma flotante para validar, repartir, sumar o compensar
importes.

## 1. Modelo canónico

### Dinero e integrantes

- `amountCents` es un entero. Los importes introducidos por el usuario son
  positivos y como mínimo `1` céntimo.
- Un importe firmado puede ser positivo o negativo, pero su magnitud siempre
  se valida como un entero positivo.
- Cada integrante tiene un `memberId` estable y un `member.position` entero
  único.
- `member.position` se asigna en el alta: los integrantes iniciales conservan
  el orden de la creación y los nuevos se añaden al final. Nunca cambia al
  renombrar, reclamar o liberar una identidad.
- Cuando se necesita un orden determinista se ordena por `position` ascendente;
  nunca por el alias, el identificador técnico ni el orden de una consulta SQL.

### Entrada decimal

La pantalla de movimiento acepta coma o punto como separador decimal, limita la
parte fraccionaria a dos posiciones y muestra un error si se supera. La API
repite esta validación como autoridad del servidor y responde `422` cuando la
entrada no puede representarse exactamente en céntimos. No se trunca ni se
redondea silenciosamente.

La conversión de una entrada válida ocurre antes de entrar en el dominio:

```text
function parseAmountToCents(decimalText):
    assert decimalText does not contain both comma and dot
    normalized = normalize one decimal separator (comma or dot)
    assert normalized has one or more integer digits
    assert normalized has at most two fractional digits

    integerPart, fractionalPart = split normalized at decimal separator
    cents = integerPart * 100 + padRight(fractionalPart, 2, "0")
    assert cents > 0
    return cents
```

El dominio y la persistencia reciben únicamente el entero `amountCents`; el
formato decimal es responsabilidad de la frontera HTTP/interfaz.

### Tipos de movimiento

Un `Movement` pertenece a un grupo y tiene un tipo, fecha, `created_at`, actor
de pago y asignaciones. Su fecha solo afecta a la validación de producto y al
orden del historial; no cambia la aritmética.

| Tipo | Entrada | Representación canónica | Asignaciones |
| --- | --- | --- | --- |
| Gasto | importe positivo | `signedAmountCents = +amountCents` | reparto igualitario entre participantes |
| Reembolso | importe positivo | `signedAmountCents = -amountCents` | mismo reparto que un gasto |
| Aportación | importe total positivo | `totalCents = amountCents` | importes por receptor, editables |

En gastos y reembolsos las asignaciones almacenan la magnitud positiva de lo
que corresponde a cada participante. El signo se aplica solo al calcular el
efecto del movimiento. En una aportación las asignaciones también son positivas
o cero y su suma debe coincidir exactamente con `totalCents`.

Un gasto o reembolso debe tener al menos un participante. Una aportación debe
tener al menos un receptor y el origen no puede aparecer entre los receptores.
Los identificadores de participantes y receptores no pueden repetirse y deben
pertenecer al mismo grupo.

## 2. Repartir un importe a partes iguales

Para un importe positivo de `A` céntimos entre `n` integrantes ya ordenados por
`member.position`:

- `base = A div n`;
- `remainder = A mod n`;
- cada integrante recibe `base` céntimos;
- los primeros `remainder` integrantes reciben un céntimo adicional.

El reparto permite asignaciones de cero cuando `A < n`; sigue siendo válido
porque el importe total queda representado exactamente y el MVP no exige un
importe mínimo por participante.

### Pseudocódigo

```text
function splitEqually(amountCents, participantIds, memberPosition):
    assert isInteger(amountCents) and amountCents > 0
    assert participantIds is not empty
    assert every id in participantIds is unique and belongs to the group

    orderedIds = sort participantIds by memberPosition[id] ascending
    count = length(orderedIds)
    base = amountCents // count
    remainder = amountCents % count
    shares = empty map

    for index from 0 to count - 1:
        memberId = orderedIds[index]
        shares[memberId] = base + (1 if index < remainder else 0)

    assert sum(shares.values) == amountCents
    return shares
```

Ejemplo: `1000` céntimos entre Ana, Bea y Carlos, en ese orden, produce `334`,
`333` y `333` céntimos. `1` céntimo entre tres integrantes produce `1`, `0` y
`0` céntimos.

Este mismo reparto se usa para gastos, reembolsos y el valor inicial de una
aportación. Una aportación puede sustituir después ese reparto por
asignaciones personalizadas, siempre que conserve las invariantes de la
sección 4.

## 3. Efecto de cada movimiento sobre los balances

Antes de procesar movimientos se inicializa el balance de cada integrante
actual a cero. Un integrante añadido después de movimientos anteriores aparece
con cero y no se añade retroactivamente a ninguna asignación.

### 3.1 Gasto y reembolso

Sea `s` el importe firmado, `p` el pagador y `q[m]` la asignación positiva de
cada participante `m`:

```text
balance[p] += s
for each participant m:
    balance[m] -= sign(s) * q[m]
```

Donde `sign(s)` vale `+1` para un gasto y `-1` para un reembolso.

Por tanto:

- un gasto de `1200` pagado por Ana y repartido entre Bea y Carlos produce
  `Ana +1200`, `Bea -600` y `Carlos -600`;
- el mismo reembolso produce `Ana -1200`, `Bea +600` y `Carlos +600`;
- si el pagador también participa, se aplican ambos efectos a su mismo balance;
  no se elimina ni se duplica la asignación.

El pagador puede no participar. El efecto sigue sumando exactamente cero:

```text
sum of effects = s - sign(s) * sum(q) = 0
```

Cambiar un movimiento entre gasto y reembolso conserva concepto, fecha,
pagador y participantes, y cambia `s` por `-s`. No se permite convertir estos
tipos en aportación.

### 3.2 Aportación

Sea `A` el origen, `totalCents` el importe total y `r[m]` la asignación del
receptor `m`:

```text
balance[A] += totalCents
for each receiver m:
    balance[m] -= r[m]
```

La suma de asignaciones debe ser `totalCents` y el origen no puede ser receptor.
La aportación representa dinero entregado previamente y reduce o modifica las
deudas resultantes; no cambia el total neto de gastos y reembolsos.

Ejemplo: si Bruno tiene `-3000` y Ana `+3000`, una aportación de Bruno a Ana de
`3000` produce `Bruno 0` y `Ana 0`. Si Bruno aporta `4000`, el excedente produce
`Bruno +1000` y `Ana -1000`; no se recorta ni se rechaza por superar la deuda.

### 3.3 Recalcular el estado completo

Los balances y la liquidación no son fuente de verdad persistida. Se calculan
de nuevo a partir de los movimientos y sus asignaciones después de crear,
editar o eliminar uno.

```text
function computeBalances(currentMembers, movements, memberPosition):
    balances = map memberId -> 0 for every current member
    totalNetCents = 0

    for movement in movements:
        assert movement belongs to the group

        if movement.type is EXPENSE or REFUND:
            sign = +1 if movement.type is EXPENSE else -1
            assert movement.amountCents > 0
            assert movement.allocations == splitEqually(
                movement.amountCents,
                movement.participantIds,
                memberPosition,
            )
            signedAmount = sign * movement.amountCents
            balances[movement.payerId] += signedAmount
            for memberId, share in movement.allocations:
                balances[memberId] -= sign * share
            totalNetCents += signedAmount

        else if movement.type is CONTRIBUTION:
            assert movement.totalCents > 0
            assert movement.originId not in movement.receiverIds
            assert sum(movement.allocations.values) == movement.totalCents
            balances[movement.originId] += movement.totalCents
            for memberId, allocation in movement.allocations:
                balances[memberId] -= allocation

    assert sum(balances.values) == 0
    return {balances, totalNetCents}
```

El cálculo devuelve a todos los integrantes actuales, incluidos los que tienen
saldo cero. Un movimiento que referencia a un integrante inexistente es una
violación de integridad y debe producir un error técnico controlado; no se debe
ignorar silenciosamente para que los balances sigan pareciendo correctos.

Editar un movimiento reemplaza sus datos y asignaciones dentro de una única
transacción, conserva `created_at` y recalcula desde cero. Eliminarlo elimina
también sus asignaciones y recalcula desde los movimientos restantes. El orden
del historial no entra en el cálculo.

## 4. Invariantes que deben cumplirse antes de calcular

Estas condiciones se validan en la frontera de dominio y se vuelven a proteger
en la persistencia cuando sea necesario:

1. Todos los importes son enteros en céntimos.
2. Los importes introducidos son positivos y mayores o iguales a `1` céntimo.
3. Los integrantes referenciados pertenecen al grupo y sus identificadores no
   se repiten dentro de una misma selección.
4. Los participantes de un gasto o reembolso son no vacíos y sus asignaciones
   son el reparto igualitario exacto del importe.
5. Los receptores de una aportación son no vacíos, no incluyen al origen y sus
   asignaciones suman exactamente el total.
6. `member.position` es único y no cambia durante la vida del grupo.
7. Todo efecto de un movimiento suma exactamente cero.
8. La suma de balances de un grupo es exactamente cero.
9. Las aportaciones no forman parte de `totalNetCents`.
10. El borrado de un integrante solo puede ocurrir si ningún movimiento lo
    referencia; por eso no existen balances históricos apuntando a un integrante
    eliminado.

Si una edición falla una validación o una versión esperada no coincide, no se
persiste ningún cambio ni se recalculan parcialmente los datos visibles.

## 5. Compensación mediante deudores y acreedores

Se crean dos listas a partir de los balances calculados:

- deudores: personas con saldo negativo, con `amountCents = -balance`;
- acreedores: personas con saldo positivo, con `amountCents = balance`.

Cada lista se ordena por `amountCents` descendente y, en empate, por
`member.position` ascendente. No se incluyen saldos cero.

Después se compensan los primeros elementos activos de ambas listas. Cada pago
es el menor entre la deuda y el crédito actuales. El elemento que llega a cero
avanza y el otro conserva el remanente.

### Pseudocódigo

```text
function settle(balances, memberPosition):
    debtors = []
    creditors = []

    for memberId, balance in balances:
        assert isInteger(balance)
        if balance < 0:
            debtors.append({memberId, amountCents: -balance})
        else if balance > 0:
            creditors.append({memberId, amountCents: balance})

    assert sum(item.amountCents for item in debtors)
        == sum(item.amountCents for item in creditors)

    sort debtors by amountCents descending, memberPosition ascending
    sort creditors by amountCents descending, memberPosition ascending

    transfers = []
    debtorIndex = 0
    creditorIndex = 0

    while debtorIndex < length(debtors)
          and creditorIndex < length(creditors):
        debtor = debtors[debtorIndex]
        creditor = creditors[creditorIndex]
        paymentCents = min(debtor.amountCents, creditor.amountCents)

        assert paymentCents > 0
        transfers.append({
            fromMemberId: debtor.memberId,
            toMemberId: creditor.memberId,
            amountCents: paymentCents,
        })

        debtor.amountCents -= paymentCents
        creditor.amountCents -= paymentCents

        if debtor.amountCents == 0:
            debtorIndex += 1
        if creditor.amountCents == 0:
            creditorIndex += 1

    assert debtorIndex == length(debtors)
    assert creditorIndex == length(creditors)
    return transfers
```

La salida cumple, para cada integrante `m`:

```text
balance[m] + outgoing[m] - incoming[m] == 0
```

Si todos los balances son cero, `transfers` es una lista vacía y la interfaz
muestra «Todo está saldado». Nunca se generan transferencias de cero ni pagos
entre una persona consigo misma.

## 6. Garantías y límites

Sean `D` el número deudores y `C` el número de acreedores. El algoritmo:

- siempre termina si la entrada cumple las invariantes;
- es válido y determinista;
- usa como máximo `D + C - 1` transferencias cuando `D > 0` y `C > 0`;
- usa cero transferencias cuando no hay saldos pendientes;
- deja a cero al menos una persona en cada transferencia.

No garantiza el mínimo global de transferencias para todos los conjuntos de
balances. Encontrar ese mínimo puede requerir explorar combinaciones de deudas y
créditos; esa optimización no forma parte del MVP y añadiría complejidad sin
mejorar la previsibilidad del resultado.

La garantía de producto es, por tanto:

> La liquidación es válida, determinista y usa como máximo `D + C - 1`
> transferencias. No promete el mínimo global absoluto en todos los casos.

## 7. Contrato de salida y texto compartible

La API devuelve identificadores y céntimos; el texto de interfaz no es fuente de
verdad:

```json
{
  "currency": "EUR",
  "transfers": [
    { "fromMemberId": "bruno", "toMemberId": "ana", "amountCents": 1250 }
  ]
}
```

La interfaz resuelve los alias actuales a partir de los identificadores y
formatea los céntimos con dos decimales y coma para español. Con pagos
pendientes, cada línea sigue exactamente el formato de MVP:
`Bruno paga 12,50 € a Ana`. No se añade encabezado ni nombre del grupo.

Las acciones de copiar y compartir usan este texto derivado y no modifican el
grupo ni reinician su caducidad.

## 8. Casos de prueba obligatorios

| Caso | Entrada mínima | Resultado esperado |
| --- | --- | --- |
| División exacta | `900` entre 3 | `300, 300, 300` |
| Resto | `1000` entre Ana, Bea y Carlos | `334, 333, 333` |
| Importe menor que participantes | `1` entre 3 | `1, 0, 0` por posición |
| Pagador participante | Ana paga `1000` y participan Ana y Bea | Ana `+500`, Bea `-500` |
| Pagador no participante | Ana paga `1200` por Bea y Carlos | Ana `+1200`, Bea `-600`, Carlos `-600` |
| Reembolso | Ana reembolsa `1200` a Bea y Carlos | Ana `-1200`, Bea `+600`, Carlos `+600` |
| Aportación uno a uno | Bruno aporta `3000` a Ana | Bruno `+3000`, Ana `-3000` |
| Aportación a varios | Bruno aporta `1000` a Ana y Carlos, `600/400` | Bruno `+1000`, Ana `-600`, Carlos `-400` |
| Aportación excesiva | Aporta más que su deuda actual | Se acepta y se conserva el excedente |
| Sin movimientos | Grupo nuevo | Todos los balances `0`, sin transferencias |
| Nuevo integrante | Alta después de movimientos | Saldo `0`, sin asignaciones históricas |
| Edición | Cambiar importe, tipo o participantes | Recalculo completo y `created_at` intacto |
| Borrado | Eliminar un movimiento | Se eliminan sus asignaciones y se recalcula |
| Total neto negativo | Reembolsos mayores que gastos | Se conserva `totalNetCents` negativo y se liquida |
| Empates | Saldos de igual magnitud | Desempate por `member.position` |
| Saldo cero | Todos los balances `0` | Lista vacía y «Todo está saldado» |
| Varias deudas y créditos | Saldos mixtos | Pagos positivos, deterministas y conservadores |
| Invariantes | Cualquier conjunto válido | Suma de balances y efecto de cada pago igual a `0` |

También deben probarse entradas inválidas: importe cero o negativo, selección
vacía, identificadores duplicados, integrante de otro grupo, origen incluido
como receptor y asignaciones de aportación cuya suma no coincide con el total.

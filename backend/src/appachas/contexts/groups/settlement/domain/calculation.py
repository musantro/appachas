from dataclasses import dataclass

from appachas.contexts.groups.shared.domain.models import Group


@dataclass
class Balance:
    member_id: str
    alias: str
    amount_cents: int


@dataclass
class Payment:
    from_member_id: str
    to_member_id: str
    amount_cents: int


@dataclass
class Settlement:
    balances: list[Balance]
    payments: list[Payment]
    text: str
    total_cents: int


@dataclass
class RemainingBalance:
    member_id: str
    amount: int


def calculate(group: Group) -> Settlement:
    members = sorted(group.members, key=lambda m: m.position)
    amounts = {m.id: 0 for m in members}
    total = 0
    for movement in group.movements:
        if movement.type != "contribution":
            total += movement.amount_cents
        amounts[movement.payer_id] += movement.amount_cents
        for allocation in movement.allocations:
            amounts[allocation.member_id] -= allocation.amount_cents
    balances = [Balance(m.id, m.alias, amounts[m.id]) for m in members]
    positions = {m.id: m.position for m in members}
    debtors = sorted(
        [
            RemainingBalance(member_id, -amount)
            for member_id, amount in amounts.items()
            if amount < 0
        ],
        key=lambda item: (-item.amount, positions[item.member_id]),
    )
    creditors = sorted(
        [
            RemainingBalance(member_id, amount)
            for member_id, amount in amounts.items()
            if amount > 0
        ],
        key=lambda item: (-item.amount, positions[item.member_id]),
    )
    payments = []
    debtor_index = creditor_index = 0
    while debtor_index < len(debtors) and creditor_index < len(creditors):
        debtor, creditor = debtors[debtor_index], creditors[creditor_index]
        amount = min(debtor.amount, creditor.amount)
        payments.append(Payment(debtor.member_id, creditor.member_id, amount))
        debtor.amount -= amount
        creditor.amount -= amount
        debtor_index += debtor.amount == 0
        creditor_index += creditor.amount == 0
    aliases = {m.id: m.alias for m in members}
    text = "\n".join(
        f"{aliases[p.from_member_id]} paga {p.amount_cents // 100},"
        f"{p.amount_cents % 100:02d} € a {aliases[p.to_member_id]}"
        for p in payments
    )
    return Settlement(balances, payments, text, total)

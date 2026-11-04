from contextvars import ContextVar

_company_id: ContextVar[str | None] = ContextVar("company_id", default=None)
_actor_id: ContextVar[str | None] = ContextVar("actor_id", default=None)


def set_company_id(company_id: str | None) -> None:
    _company_id.set(company_id)


def get_company_id() -> str | None:
    return _company_id.get()


def set_actor_id(actor_id: str | None) -> None:
    _actor_id.set(actor_id)


def get_actor_id() -> str | None:
    return _actor_id.get()

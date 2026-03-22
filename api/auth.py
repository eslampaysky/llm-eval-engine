import os
from fastapi import Header, HTTPException
from dotenv import load_dotenv

from api.database import get_client_by_api_key, register_client

load_dotenv()

API_KEYS = [k.strip() for k in os.getenv("API_KEYS", "").split(",") if k.strip()] //api

def bootstrap_clients_from_env():
    for entry in API_KEYS:
        if ":" in entry:
            name, key = entry.split(":", 1)
            register_client(name=name.strip() or "client", api_key=key.strip())
        else:
            register_client(name="client", api_key=entry)


def validate_api_key(x_api_key: str = Header(..., alias="X-API-KEY")):
    client = get_client_by_api_key(x_api_key)
    if not client:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return {"api_key": x_api_key, "client": client}

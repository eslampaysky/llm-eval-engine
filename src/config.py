import os
from dotenv import load_dotenv

load_dotenv()

def get_api_key(provider: str):

    if provider == "openai":
        return os.getenv("OPENAI_API_KEY")

    if provider == "anthropic":
        return os.getenv("ANTHROPIC_API_KEY")

    if provider == "gemini":
        return os.getenv("GEMINI_API_KEY")

    return None
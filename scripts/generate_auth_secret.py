import os
import secrets


def update_env(auth_secret: str, env_path: str = ".env") -> None:
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()

    updated = False
    next_lines = []
    for line in lines:
        if line.strip().startswith("AUTH_SECRET="):
            next_lines.append(f"AUTH_SECRET={auth_secret}")
            updated = True
        else:
            next_lines.append(line)

    if not updated:
        if next_lines and next_lines[-1].strip() != "":
            next_lines.append("")
        next_lines.append(f"AUTH_SECRET={auth_secret}")

    with open(env_path, "w", encoding="utf-8") as f:
        f.write("\n".join(next_lines) + "\n")


def main() -> int:
    auth_secret = secrets.token_hex(32)
    update_env(auth_secret)
    print("AUTH_SECRET generated and written to .env")
    print(f"AUTH_SECRET={auth_secret}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

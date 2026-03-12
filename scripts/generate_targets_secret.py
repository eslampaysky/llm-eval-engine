import sys

from cryptography.fernet import Fernet


def main() -> int:
    key = Fernet.generate_key().decode("utf-8")
    print("TARGETS_SECRET (Fernet key):")
    print(key)
    print("")
    print("Example:")
    print(f"TARGETS_SECRET={key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

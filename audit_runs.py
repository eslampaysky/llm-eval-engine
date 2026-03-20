import requests
import time
import sys

BASE = "https://llm-eval-engine-production.up.railway.app"
EMAIL = "eslamsamy650@gmail.com"
PASSWORD = "123Esl@m321"
API_KEY = "client_key"

def log(msg):
    print(f"\033[0;36m[{time.strftime('%H:%M:%S')}]\033[0m {msg}")

def pass_msg(msg):
    print(f"\033[0;32m[PASS]\033[0m {msg}")

def fail(msg):
    print(f"\033[0;31m[FAIL]\033[0m {msg}")

def warn(msg):
    print(f"\033[1;33m[WARN]\033[0m {msg}")

def main():
    log(f"Logging in as {EMAIL} ...")
    try:
        r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        r.raise_for_status()
        data = r.json()
        token = data.get("access_token") or data.get("token", "")
        if not token:
            fail(f"Login failed. Response: {data}")
            sys.exit(1)
        pass_msg(f"Token acquired: {token[:20]}...")
    except Exception as e:
        fail(f"Login failed. Error: {e}")
        sys.exit(1)

    def run_audit(num, url, tier, desc):
        print("\n" + "─" * 50)
        log(f"Audit #{num} — {desc}")
        log(f"URL: {url}  |  Tier: {tier}")
        print("─" * 50)

        start_time = time.time()
        headers = {
            "Authorization": f"Bearer {token}",
            "X-API-KEY": API_KEY,
            "Content-Type": "application/json"
        }
        try:
            r = requests.post(f"{BASE}/agentic-qa/start", headers=headers, json={
                "url": url,
                "tier": tier,
                "site_description": desc
            })
            r.raise_for_status()
            data = r.json()
            audit_id = data.get("audit_id")
            if not audit_id:
                fail(f"Could not start audit. Response: {data}")
                return False
        except Exception as e:
            fail(f"Could not start audit. Error: {e}")
            return False

        log(f"Audit ID: {audit_id} — polling...")

        for _ in range(36):
            time.sleep(5)
            try:
                sr = requests.get(f"{BASE}/agentic-qa/status/{audit_id}", headers=headers)
                s_data = sr.json()
                status = s_data.get("status")

                if status == "done":
                    end_time = time.time()
                    duration = int(end_time - start_time)

                    score = s_data.get("score", "n/a")
                    tl = s_data.get("journey_timeline") or []
                    app_type = tl[0].get("app_type", "n/a") if tl else "n/a"
                    
                    if tl:
                        journeys = "\n".join([f"  {j.get('journey', '?')}: {j.get('status', '?')}" for j in tl])
                    else:
                        journeys = "none"

                    step_results = s_data.get("step_results") or []
                    events = []
                    for s in step_results:
                        for ra in (s.get("recovery_attempts") or []):
                            if isinstance(ra, dict):
                                events.append(ra.get("blocker_type", "unknown"))
                            else:
                                events.append(str(ra))
                    recovery = ", ".join(events) if events else "none"

                    blocked = any(s.get("failure_type") == "blocked_by_bot_protection" for s in step_results)
                    bot = "YES — blocked_by_bot_protection" if blocked else "no"

                    video = "yes" if s_data.get("video_url") else "no"

                    pass_msg(f"Audit #{num} DONE in {duration}s")
                    print(f"  score:     {score}")
                    print(f"  app_type:  {app_type}")
                    print(f"  video:     {video}")
                    print(f"  bot block: {bot}")
                    print(f"  recovery:  {recovery}")
                    print(f"  journeys:\n{journeys}")
                    return True

                if status == "failed":
                    fail(f"Audit #{num} FAILED")
                    import json
                    print(json.dumps(s_data, indent=2)[:500])
                    return False

                print(".", end="", flush=True)

            except Exception as e:
                print(f"Poll error: {e}", end="", flush=True)

        print("")
        fail(f"Audit #{num} TIMED OUT after 3 minutes")
        return False

    log("Checking Railway health...")
    try:
        h = requests.get(f"{BASE}/health")
        h.raise_for_status()
        commit = h.json().get("commit", "?")
        pass_msg(f"Railway is up — commit: {commit}")
    except Exception as e:
        fail(f"Health check failed: {e}")

    print("\n╔" + "═"*50 + "╗")
    print("║     Starting 5-Audit OOM Validation Suite        ║")
    print("║     Watch Railway memory graph while this runs   ║")
    print("╚" + "═"*50 + "╝\n")

    audits = [
        (1, "https://linear.app", "deep", "SaaS project management marketing site with pricing and features"),
        (2, "https://www.gymshark.com", "deep", "E-commerce fitness apparel store with product catalog and cart"),
        (3, "https://www.notion.so", "deep", "SaaS productivity and notes platform with marketing landing page"),
        (4, "https://www.airbnb.com", "deep", "Travel accommodation marketplace with search and listings"),
        (5, "https://www.autotrader.co.uk", "deep", "Car listings site — expected to be blocked by Cloudflare bot protection"),
    ]

    for i, (num, url, tier, desc) in enumerate(audits):
        run_audit(num, url, tier, desc)
        if i < len(audits) - 1:
            print(f"Sleeping 20 seconds...")
            time.sleep(20)

    print("\n" + "═"*50)
    print("  All 5 audits attempted.")
    print("  If none crashed Railway — OOM fix is working.")
    print("  Check Railway logs for: [Memory] rss=...MB")
    print("  Memory should spike then DROP after each audit.")
    print("  A rising staircase = context/browser not closed.")
    print("═"*50)

if __name__ == "__main__":
    main()

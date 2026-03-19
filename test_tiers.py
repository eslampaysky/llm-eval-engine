import urllib.request, json, time, sys

try:
    req_login = urllib.request.Request(
        "https://llm-eval-engine-production.up.railway.app/auth/login",
        data=json.dumps({"email": "eslamsamy650@gmail.com", "password": "123Esl@m321"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    res = urllib.request.urlopen(req_login)
    token = json.loads(res.read())["access_token"]
except Exception as e:
    print(f"Login failed: {e}")
    sys.exit(1)

def req(url, method="GET", data=None):
    r = urllib.request.Request(
        url, 
        data=json.dumps(data).encode() if data else None, 
        headers={
            "Content-Type": "application/json", 
            "Authorization": f"Bearer {token}",
            "X-API-KEY": "client_key"
        }, 
        method=method
    )
    try:
        res = urllib.request.urlopen(r)
        return json.loads(res.read())
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.reason}")
        print(e.read().decode())
        sys.exit(1)

def test_tier(tier_name):
    print(f"\n--- Starting {tier_name.upper()} Tier Test ---")
    start = req("https://llm-eval-engine-production.up.railway.app/agentic-qa/start", "POST", {"url": "https://example.com", "tier": tier_name})
    audit_id = start["audit_id"]
    print(f"Audit ID: {audit_id}")
    
    start_time = time.time()
    while True:
        status = req(f"https://llm-eval-engine-production.up.railway.app/agentic-qa/status/{audit_id}")
        print(f"Status: {status.get('status')} ({int(time.time() - start_time)}s elapsed)")
        if status.get("status") in ("done", "failed"):
            print(f"\n{tier_name.upper()} Final Result:")
            print(json.dumps(status, indent=2))
            with open(f"result_{tier_name}.json", "w") as f:
                json.dump(status, f, indent=2)
            break
        # Auto-timeout locally to avoid infinite hang
        if time.time() - start_time > 300:
            print(f"Timeout! Hanging for over 5 minutes.")
            break
        time.sleep(5)

test_tier("vibe")
test_tier("deep")
test_tier("fix")

import urllib.request, json, time, sys

token = sys.argv[1]

def req(url, method="GET", data=None):
    r = urllib.request.Request(
        url, 
        data=json.dumps(data).encode() if data else None, 
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}, 
        method=method
    )
    try:
        res = urllib.request.urlopen(r)
        return json.loads(res.read())
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.reason}")
        print(e.read().decode())
        sys.exit(1)

print("Starting Vibe Tier Test...")
start = req("https://llm-eval-engine-production.up.railway.app/agentic-qa/start", "POST", {"url": "https://example.com", "tier": "vibe"})
print("Start response:", start)
audit_id = start["audit_id"]

while True:
    status = req(f"https://llm-eval-engine-production.up.railway.app/agentic-qa/status/{audit_id}")
    print("Status:", status.get("status"))
    if status.get("status") in ("done", "failed"):
        print("\nFinal Result:")
        print(json.dumps(status, indent=2))
        break
    time.sleep(5)

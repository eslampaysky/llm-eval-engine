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
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "X-API-KEY": "client_key"}, 
        method=method
    )
    try:
        res = urllib.request.urlopen(r)
        return json.loads(res.read())
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.reason}")
        print(e.read().decode())
        sys.exit(1)

print("\n--- Starting REAL-WORLD FIX Tier Test ---")
start = req("https://llm-eval-engine-production.up.railway.app/agentic-qa/start", "POST", {"url": "https://ai-breaker-labs.vercel.app", "tier": "fix"})
audit_id = start["audit_id"]
print(f"Audit ID: {audit_id}")

start_time = time.time()
while True:
    status = req(f"https://llm-eval-engine-production.up.railway.app/agentic-qa/status/{audit_id}")
    print(f"Status: {status.get('status')} ({int(time.time() - start_time)}s elapsed)")
    if status.get("status") in ("done", "failed"):
        print("\nFINAL RESULT:")
        print(json.dumps(status, indent=2))
        with open("result_realworld_fix.json", "w") as f:
            json.dump(status, f, indent=2)
        
        # Test the video endpoint
        if status.get("video_url"):
            vid_url = "https://llm-eval-engine-production.up.railway.app" + status["video_url"]
            try:
                print(f"\nChecking video URL: {vid_url}")
                vid_req = urllib.request.Request(
                    vid_url, 
                    headers={"Authorization": f"Bearer {token}", "X-API-KEY": "client_key"}
                )
                vid_res = urllib.request.urlopen(vid_req)
                print(f"Video endpoint returned code: {vid_res.getcode()} (length: {vid_res.headers.get('Content-Length')}, type: {vid_res.headers.get('Content-Type')})")
            except Exception as e:
                print(f"Video endpoint failed! {e}")
                
        break
    if time.time() - start_time > 300:
        print("Timeout! Hanging over 5 mins.")
        break
    time.sleep(5)

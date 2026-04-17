import asyncio
import json
import logging
from dotenv import load_dotenv

load_dotenv()

# We need to import the core QA runner to test real execution
from core.agentic_qa import run_agentic_qa

# Hardcode 4 endpoints reflecting exactly the taxonomy requested by Phase 5.5
URLS_TO_TEST = [
    "https://scrapeme.live/shop/",  # Ecommerce
    "https://example.com",          # Clean baseline
    "https://github.com/login",     # SaaS Auth Required
    "https://httpstat.us/403"       # Deliberate Block/Error
]

def eval_sites():
    print(f"===========================================================")
    print(f"PHASE 5.5 REALITY CHECK: {len(URLS_TO_TEST)} Audits Start")
    print(f"===========================================================\n")
    
    for i, url in enumerate(URLS_TO_TEST):
        print(f"--- [Audit {i+1}] STARTING: {url} ---")
        try:
            # We enforce a timeout limit roughly at 90s manually, but web_agent has its own limits
            result = run_agentic_qa(url)
            
            # The narrative is stored right in 'summary' and 'narrative' key due to our Phase 5 upgrades!
            from core.agentic_qa import result_to_dict
            d = result_to_dict(result)
            
            exec_sum = d.get('executive_summary', 'N/A')
            root_cause = d.get('narrative', {}).get('root_cause_narrative', 'N/A')
            impact = d.get('narrative', {}).get('impact_assessments', 'N/A')
            
            print(f">>> EXECUTIVE SUMMARY:\n{exec_sum}\n")
            print(f">>> ROOT CAUSE:\n{root_cause}\n")
            print(f">>> IMPACT:\n{json.dumps(impact, indent=2)}\n")
            print(f"--- [Audit {i+1}] FINISHED! ---\n")
            
        except Exception as e:
            print(f"--- [Audit {i+1}] CRASHED: {e} ---\n")

if __name__ == "__main__":
    eval_sites()


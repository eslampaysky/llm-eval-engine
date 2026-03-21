import json
import glob
import os

files = glob.glob('artifacts/real_user_data/runs/2026-03-21/*.json')
files = sorted(files)

failures = []
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        data = json.load(file)
        ft = data.get('meta', {}).get('failure_type')
        if ft and ft != 'none':
            step = data.get('meta', {}).get('failed_step')
            group = data.get('meta', {}).get('group')
            name = data.get('meta', {}).get('name')
            # Extract the actual step_results for this failed step
            step_result = {}
            for res in data.get('step_results', []):
                if res.get('status') == 'failed':
                    step_result = {
                        'step_name': res.get('step_name'),
                        'error': res.get('error'),
                        'url': res.get('before_snapshot', {}).get('url')
                    }
                    break
            
            pattern = f"{group} / {ft} / {step}"
            failures.append({
                'site': name,
                'pattern': pattern,
                'step_result': step_result
            })

print(json.dumps(failures, indent=2))

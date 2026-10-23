#!/usr/bin/env python3
"""唯讀盤點；僅操作 H-Global，輸出不含憑證。"""
import json, os, subprocess, sys
from pathlib import Path
PROJECT = 'h-global1985'
ACCOUNT = 'hglobal1985@gmail.com'
SDK = Path.home()/'.local/share/hglobal-management/google-cloud-sdk/bin/gcloud'
env = dict(os.environ, CLOUDSDK_CONFIG=str(Path.home()/'.config/gcloud-hglobal'))
base = [str(SDK), '--configuration=hglobal', '--project='+PROJECT, '--account='+ACCOUNT, '--quiet']
def run(args):
    p = subprocess.run(base+args+['--format=json'], env=env, text=True, capture_output=True)
    if p.returncode:
        return {'verified':False, 'error':p.stderr.strip()}
    return {'verified':True, 'data':json.loads(p.stdout)}
accounts=run(['auth','list'])
if not accounts['verified'] or not any(a.get('account')==ACCOUNT for a in accounts['data']):
    sys.exit('尚未登入指定 H-Global 帳號；停止盤點。')
report={
 'project':run(['projects','describe',PROJECT]),
 'iam':run(['projects','get-iam-policy',PROJECT]),
 'enabled_apis':run(['services','list','--enabled']),
}
print(json.dumps(report,ensure_ascii=False,indent=2))

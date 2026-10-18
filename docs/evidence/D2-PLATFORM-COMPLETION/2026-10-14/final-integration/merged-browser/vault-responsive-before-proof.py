"""Actual authenticated QA UI reads. No source changes, DB writes, API mocks or model turns."""
import argparse, datetime, json, pathlib, re, traceback
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('variant', choices=['light', 'dark', 'mobile'])
args = parser.parse_args()
base = 'http://127.0.0.1:5000'
fixture = json.loads(pathlib.Path('/tmp/source-access-ui-browser-fixtures.json').read_text())
session = json.loads(pathlib.Path('/tmp/platform-browser-session.json').read_text())
assert str(session['user']['id']) == str(fixture['actorId']) == '25'
expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=session.get('expiresIn', 86400))).isoformat()
auth = {'trialsage_access_token': session['accessToken'], 'trialsage_refresh_token': session.get('refreshToken', ''),
        'trialsage_token_expiry': expiry, 'trialsage_user': json.dumps(session['user'])}
width = 390 if args.variant == 'mobile' else 1440
out = pathlib.Path('/tmp/vault-responsive-before-' + args.variant)
out.mkdir(exist_ok=True)
result = {'variant': args.variant, 'fixture': {'programId': fixture['programId'], 'sectionId': fixture['sectionId'],
          'title': fixture['title']}, 'scope': 'Actual positive authenticated seeded QA UI; synthetic records, no clinical evidence',
          'pageErrors': [], 'consoleErrors': [], 'apiFailures': [], 'blockedWrites': [], 'providerTurns': [], 'surfaces': {}, 'apiReadFacts': {}}

def write(name, data):
    (out / name).write_text(json.dumps(data, indent=2))

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': width, 'height': 1000}, device_scale_factor=1)
    prefs = {'dark': args.variant == 'dark', 'railCollapsed': True, 'anaMode': 'standard', 'anaRunPolicy': 'manual',
             'segment': 'biopharma', 'welcomeDismissed': True, 'liveDrive': False, 'liveDriveDefault': 2}
    context.add_init_script('((v,p)=>{for(const[k,x]of Object.entries(v)){localStorage.setItem(k,x);sessionStorage.setItem(k,x)}localStorage.setItem("c2c-v2-prefs",JSON.stringify(p))})(' + json.dumps(auth) + ',' + json.dumps(prefs) + ')')
    page = context.new_page()
    page.on('pageerror', lambda error: result['pageErrors'].append(str(error)))
    page.on('console', lambda message: result['consoleErrors'].append(message.text) if message.type == 'error' else None)

    def gate_writes(route):
        request = route.request
        if '/api/' in request.url and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            path = urlparse(request.url).path
            result['blockedWrites'].append({'method': request.method, 'path': path})
            if any(part in path for part in ('/stream', '/turn', '/chat/send')):
                result['providerTurns'].append({'method': request.method, 'path': path})
            route.abort()
        else:
            route.continue_()
    context.route('**/api/**', gate_writes)

    def response_seen(response):
        if '/api/' in response.url and response.status >= 400:
            result['apiFailures'].append({'path': urlparse(response.url).path, 'status': response.status})
        path = urlparse(response.url).path
        if response.status == 200 and path == '/api/c2c/projects/' + fixture['programId'] + '/sources':
            payload = response.json()
            read = payload.get('data', payload)
            result['apiReadFacts']['projectSources'] = {'usageScope': read.get('usageScope'), 'total': read.get('total'),
                'sources': [{key: source.get(key) for key in ('id', 'title', 'usage', 'ingestionStatus', 'extractionStatus')}
                            for source in read.get('sources', []) if source.get('id') in [item['id'] for item in fixture['sources']]]}
        if response.status == 200 and path == '/api/c2c/project-vault/search':
            payload = response.json()
            read = payload.get('data', payload)
            result['apiReadFacts']['library'] = {'scope': read.get('scope'), 'total': read.get('total'), 'query': read.get('query')}
    page.on('response', response_seen)

    def capture(surface, extra=None):
        page.wait_for_timeout(300)
        body_width = page.evaluate('document.body.scrollWidth')
        details = {'bodyWidth': body_width, 'viewportWidth': width, 'url': urlparse(page.url).path}
        if extra:
            details.update(extra)
        result['surfaces'][surface] = details
        page.screenshot(path=str(out / (surface + '.png')), full_page=True)
        write('summary.json', result)
        assert body_width <= width, (surface, body_width, width)

    def layout():
        return page.evaluate('''() => Object.fromEntries(['.vd-wrap','.vd-top','.vd-grid','.vd-tree','.vd-list','.vd-detail','.vd-breadcrumb','.vd-search input[type=search]'].map(selector => {
            const node=document.querySelector(selector); if(!node)return [selector,null];const r=node.getBoundingClientRect(); const style=getComputedStyle(node);
            return [selector,{left:r.left,right:r.right,width:r.width,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,scrollLeft:node.scrollLeft,scrollTop:node.scrollTop,display:style.display,overflowX:style.overflowX,gridTemplateColumns:style.gridTemplateColumns}];
        }))''')
    try:
        pid=fixture['programId']
        page.goto(base+'/concept2cure/vault?program='+pid,wait_until='domcontentloaded',timeout=60000)
        search=page.get_by_label('Search this vault',exact=True);search.wait_for(timeout=45000)
        page.get_by_role('heading',name='Vault (DMS)',exact=True).wait_for(timeout=45000)
        capture('vault-initial-layout',{'layout':layout()})
        search.fill(fixture['vault'][0]['title'])
        row=page.locator('button.vd-row').filter(has_text=fixture['vault'][0]['title']);row.wait_for(timeout=30000);row.click()
        page.get_by_test_id('vault-relationships').get_by_test_id('vault-relationship').wait_for(timeout=30000)
        page.get_by_test_id('vault-version-'+fixture['vault'][0]['id']).wait_for(timeout=30000)
        page.get_by_test_id('vault-relationships').scroll_into_view_if_needed()
        selected=layout();capture('vault-selected-layout',{'layout':selected})
        result['responsiveLayoutPassed']=all(node is None or (node['left']>=0 and node['right']<=width and node['scrollWidth']<=node['clientWidth']) for node in selected.values())
        assert not result['pageErrors'] and not result['consoleErrors'] and not result['apiFailures'] and not result['blockedWrites']
        result['passed']=True
    except Exception as error:
        result['passed'] = False
        result['failure'] = str(error)
        result['traceback'] = traceback.format_exc()
        try:
            page.screenshot(path=str(out / 'failure.png'), full_page=True)
            (out / 'failure-body.txt').write_text(page.locator('body').inner_text())
        except Exception:
            pass
        raise
    finally:
        write('summary.json', result)
        context.close()
        browser.close()
print(json.dumps({'variant': args.variant, 'passed': result.get('passed'), 'surfaces': list(result['surfaces']),
                  'pageErrors': len(result['pageErrors']), 'consoleErrors': len(result['consoleErrors']),
                  'apiFailures': len(result['apiFailures']), 'blockedWrites': result['blockedWrites']}))

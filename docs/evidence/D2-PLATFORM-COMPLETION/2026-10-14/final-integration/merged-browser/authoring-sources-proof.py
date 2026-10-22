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
out = pathlib.Path('/tmp/source-access-ui-merged-authoring-' + args.variant)
out.mkdir(exist_ok=True)
result = {'variant': args.variant, 'fixture': {'programId': fixture['programId'], 'sectionId': fixture['sectionId'],
          'title': fixture['title']}, 'scope': 'Actual authoring Sources read; automatic collaboration requests blocked and separately recorded; synthetic QA only',
          'pageErrors': [], 'consoleErrors': [], 'apiFailures': [], 'blockedWrites': [], 'providerTurns': [], 'surfaces': {}, 'apiReadFacts': {}, 'requestFailures': []}

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
        if response.status == 200 and path == '/api/authoring/sections/' + fixture['sectionId'] + '/sources':
            payload = response.json()
            result['apiReadFacts']['sectionSources'] = {'sectionId': payload.get('sectionId'), 'success': payload.get('success'),
                'sources': [{'citationId': item.get('citationId'), 'sectionId': item.get('sectionId'), 'state': item.get('state'),
                             'sourceId': (item.get('source') or {}).get('id'), 'sourceTitle': (item.get('source') or {}).get('title'),
                             'citedChecksum': item.get('citedChecksum'), 'currentChecksum': (item.get('source') or {}).get('checksum')}
                            for item in payload.get('sources', [])]}
    page.on('response', response_seen)
    page.on('requestfailed', lambda request: result['requestFailures'].append({'method': request.method, 'path': urlparse(request.url).path, 'failure': request.failure}))

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

    try:
        pid = fixture['programId']
        page.goto(base + '/concept2cure/project-home?program=' + pid, wait_until='domcontentloaded', timeout=60000)
        page.get_by_role('heading', name=fixture['title'], exact=True).wait_for(timeout=45000)
        document = page.get_by_test_id('pj-doc-row').filter(has_text='Synthetic QA accessible citation document')
        document.wait_for(timeout=30000)
        result['programDocumentRow'] = document.inner_text()
        document.screenshot(path=str(out / 'project-home-document-row.png'))
        # Open the actual saved authoring row; no working-copy creation or model action.
        document.get_by_role('button', name='Open Synthetic QA accessible citation document', exact=True).click()
        page.get_by_test_id('sources-rail-open').wait_for(timeout=30000)
        page.get_by_test_id('save-section').filter(has_text='Saved').wait_for(timeout=30000)
        page.get_by_test_id('sources-rail-open').click()
        source_rail = page.locator('aside.ed-comments')
        source_rail.get_by_text(fixture['sources'][0]['title'], exact=True).wait_for(timeout=30000)
        source_rail_text = source_rail.inner_text()
        assert 'matches the source record as stored' in source_rail_text.lower()
        assert 'Couldn’t load this section’s sources' not in source_rail_text
        source_rail.get_by_text(fixture['sources'][0]['title'], exact=True).scroll_into_view_if_needed()
        source_rail.screenshot(path=str(out / 'authoring-source-rail-detail.png'))
        capture('authoring-current-source-rail', {'sourceRail': source_rail_text, 'docId': fixture['docId'], 'sectionId': fixture['sectionId']})
        facts = result['apiReadFacts']['sectionSources']
        assert facts['success'] is True and facts['sectionId'] == fixture['sectionId']
        assert len(facts['sources']) == 1
        source = facts['sources'][0]
        assert source['sourceId'] == fixture['sources'][0]['id'] and source['sourceTitle'] == fixture['sources'][0]['title']
        assert source['state'] == 'current' and source['citedChecksum'] == source['currentChecksum'] == fixture['sources'][0]['checksum']
        assert not result['pageErrors'] and not result['apiFailures'] and not result['providerTurns'], result
        # Authoring auto-joins/leaves collaboration. Refuse those writes, record
        # their resulting browser failures, and permit no other failed request.
        assert all(item['path'].startswith('/api/realtime-collab/rooms') for item in result['blockedWrites']), result['blockedWrites']
        assert all(item['path'].startswith('/api/realtime-collab/rooms') for item in result['requestFailures']), result['requestFailures']
        assert all(item == 'Failed to load resource: net::ERR_FAILED' for item in result['consoleErrors']), result['consoleErrors']
        result['completedApiMutations'] = 0
        result['automaticCollaborationAttemptsBlocked'] = len(result['blockedWrites'])
        result['passed'] = True
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

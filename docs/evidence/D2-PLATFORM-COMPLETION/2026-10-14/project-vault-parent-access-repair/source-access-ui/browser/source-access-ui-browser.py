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
out = pathlib.Path('/tmp/source-access-ui-browser-' + args.variant)
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

    try:
        pid = fixture['programId']
        page.goto(base + '/concept2cure/project-home?program=' + pid, wait_until='domcontentloaded', timeout=60000)
        page.get_by_role('heading', name=fixture['title'], exact=True).wait_for(timeout=45000)
        document = page.get_by_test_id('pj-doc-row').filter(has_text='Synthetic QA accessible citation document')
        document.wait_for(timeout=30000)
        result['programDocumentRow'] = document.inner_text()
        document.screenshot(path=str(out / 'project-home-document-row.png'))
        # Data room is shown by the existing Evidence lifecycle navigation.
        page.get_by_role('navigation', name='Project lifecycle', exact=True).get_by_role('button', name='Evidence', exact=True).click()
        alpha = page.locator('.pj-src').filter(has_text=fixture['sources'][0]['title'])
        alpha.wait_for(timeout=30000)
        beta = page.locator('.pj-src').filter(has_text=fixture['sources'][1]['title'])
        beta.wait_for(timeout=15000)
        alpha_text, beta_text = alpha.inner_text(), beta.inner_text()
        assert 'Used in 1 accessible section · 1 accessible document' in alpha_text, alpha_text
        assert 'No accessible citations' in beta_text, beta_text
        assert 'Citation usage unavailable' not in alpha_text + beta_text
        page.get_by_text('Reading the project vault…', exact=True).wait_for(state='hidden', timeout=30000)
        alpha.scroll_into_view_if_needed()
        capture('project-home-sources', {'alpha': alpha_text, 'beta': beta_text})

        page.goto(base + '/concept2cure/vault?program=' + pid, wait_until='domcontentloaded', timeout=45000)
        search = page.get_by_label('Search this vault', exact=True)
        search.wait_for(timeout=30000)
        search.fill(fixture['vault'][0]['title'])
        row = page.locator('button.vd-row').filter(has_text=fixture['vault'][0]['title'])
        row.wait_for(timeout=30000)
        row.click()
        relationships = page.get_by_test_id('vault-relationships')
        relationships.get_by_test_id('vault-relationship').wait_for(timeout=30000)
        history = page.get_by_test_id('vault-document-history')
        page.wait_for_function("() => [...document.querySelectorAll('[data-testid=\"vault-document-history\"]')].some(node => !node.innerText.includes('Loading history'))", timeout=30000)
        versions = page.get_by_test_id('vault-versions')
        page.get_by_test_id('vault-version-' + fixture['vault'][0]['id']).wait_for(timeout=30000)
        relationship_text = relationships.inner_text()
        assert fixture['vault'][1]['title'] in relationship_text and 'References' in relationship_text, relationship_text
        assert 'Only related documents you can currently access are shown.' in relationship_text
        history_text = history.inner_text()
        assert 'history could not be read' not in history_text and 'No recorded events' not in history_text, history_text
        assert 'Audit chain verified' in history_text, history_text
        versions_text = versions.inner_text()
        assert 'no submission placements are available to you' in versions_text
        assert 'limited to records you can currently access' in versions_text
        relationships.scroll_into_view_if_needed()
        capture('vault-record-context', {'relationships': relationship_text, 'history': history_text, 'versions': versions_text})
        page.get_by_label('Accessible projects', exact=True).check()
        search.fill('Synthetic QA accessibility')
        library = page.get_by_test_id('vault-library-results')
        library.get_by_role('button', name='Download ' + fixture['vault'][0]['title'] + ' from ' + fixture['title'], exact=True).wait_for(timeout=30000)
        library_text = library.inner_text()
        assert 'in projects you can access match' in library_text, library_text
        assert fixture['vault'][0]['title'] in library_text and fixture['vault'][1]['title'] in library_text
        assert 'all projects match' not in library_text.lower()
        library.scroll_into_view_if_needed()
        capture('vault-accessible-library', {'library': library_text})

        page.goto(base + '/concept2cure/source-tracer?program=' + pid, wait_until='domcontentloaded', timeout=45000)
        page.get_by_role('heading', name='Source tracer', exact=True).wait_for(timeout=30000)
        # Resolve its exact seeded title through a read-only canonical API, then select its existing row.
        response = context.request.get(base + '/api/source-tracer/sections', headers={'Authorization': 'Bearer ' + session['accessToken']})
        assert response.ok, response.status
        read = response.json()['data']
        assert read['scope'] == 'verified-accessible-authoring-sections'
        section = next(row for row in read['sections'] if row['id'] == fixture['sectionId'])
        page.locator('button.sp-row').filter(has_text=section['doc']).click()
        page.get_by_text(fixture['sources'][0]['title'], exact=True).wait_for(timeout=20000)
        source_body = page.locator('.sp').inner_text()
        assert 'accessible section' in source_body and 'Only records visible with your current access appear.' in source_body
        assert 'matches the source record as stored' in source_body.lower()
        assert fixture['sources'][0]['title'] in source_body
        page.get_by_role('heading', name='Source tracer', exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(out / 'source-tracer-accessible-counts.png'), full_page=True)
        page.get_by_text(fixture['sources'][0]['title'], exact=True).scroll_into_view_if_needed()
        capture('source-tracer-recorded-citation', {'accessibleSectionsReturned': len(read['sections']),
                'seededSectionTitle': section['sectionTitle'], 'seededDocumentTitle': section['doc'],
                'seededCitationCount': len(section['sources']), 'sourceScope': read['scope'],
                'seededSourceTitle': section['sources'][0]['sourceTitle'], 'sourceState': section['sources'][0]['state']})

        assert not result['pageErrors'] and not result['consoleErrors'] and not result['apiFailures'], result
        assert not result['blockedWrites'] and not result['providerTurns'], result['blockedWrites']
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

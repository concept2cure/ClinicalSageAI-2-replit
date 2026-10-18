"""Prepared actual persisted-fixture review. No API interception, fabricated data or token artifacts."""
import argparse
import collections
import datetime
import hashlib
import json
import os
import pathlib
import re
import time
from urllib.parse import urlparse, urlencode
from playwright.sync_api import sync_playwright

FOLDER = pathlib.Path(__file__).resolve().parent

def safe_error(value):
    text = str(value)
    text = re.sub(r'Bearer\s+\S+', 'Bearer [redacted]', text, flags=re.I)
    text = re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[redacted-session-token]', text)
    return text[:3000]

def rows(body):
    if isinstance(body, list):
        return body
    if isinstance(body, dict) and isinstance(body.get('data'), list):
        return body['data']
    raise RuntimeError('The live list did not have the canonical row shape.')

def retained_manifest(body):
    """Only public coverage metadata, never source prose, storage handles or auth fields."""
    if not isinstance(body, dict):
        return None
    keys = ['pathway', 'framework', 'generatedFrom', 'ready', 'totals', 'scope', 'entries', 'sourceIssues', 'contradictions', 'checkApplicability']
    return {key: body[key] for key in keys if key in body}

def get_json(context, base, path, token, organization_id):
    response = context.request.get(base + path, headers={'Authorization': 'Bearer ' + token, 'x-organization-id': str(organization_id)}, timeout=45000)
    try:
        body = response.json()
    except Exception:
        body = None
    return response.status, body

def scope_matches(body, fixture, organization_id):
    if not isinstance(body, dict) or not isinstance(body.get('scope'), dict):
        return False
    scope = body['scope']
    return scope.get('programId') == fixture['programId'] and scope.get('submissionId') == fixture['submissionId'] and scope.get('sequenceId') == fixture['sequenceId'] and scope.get('organizationId') == organization_id

def coverage_path(fixture):
    return '/api/submissions/sequences/' + str(fixture['sequenceId']) + '/pathway-manifest?' + urlencode({'programId': fixture['programId'], 'submissionId': fixture['submissionId']})

def discover(context, config, token):
    """Read existing admitted lists only; classify actual evaluated evidence, not filing titles."""
    selected = []
    seen = set()
    outcomes = []
    base_ids = {fixture['submissionId'] for fixture in config['fixtures']}
    for seed in config['fixtures']:
        if seed['expectedUnsupported']:
            continue
        path = '/api/submissions?' + urlencode({'programId': seed['programId']})
        status, listing = get_json(context, config['baseUrl'], path, token, config['organizationId'])
        if status != 200:
            outcomes.append({'path': path, 'status': status, 'qualification': 'Additional retained candidates unavailable; no data fabricated.'})
            continue
        for submission in rows(listing)[:25]:
            if submission.get('id') in base_ids or submission.get('programId') != seed['programId']:
                continue
            status, sequence_body = get_json(context, config['baseUrl'], '/api/submissions/' + str(submission['id']) + '/sequences', token, config['organizationId'])
            if status != 200:
                continue
            for sequence in rows(sequence_body)[:5]:
                availability = sequence.get('deliverables')
                if not isinstance(availability, dict) or availability.get('available') is not True or not availability.get('recordedPathway'):
                    continue
                fixture = {'name': 'retained-extra-' + str(sequence['id']), 'programId': seed['programId'], 'submissionId': submission['id'], 'sequenceId': sequence['id'], 'projectId': seed['projectId'], 'expectedUnsupported': False, 'editorQualification': 'Actual live sourceRefs determine handoff eligibility; no guessed document IDs.'}
                status, body = get_json(context, config['baseUrl'], coverage_path(fixture), token, config['organizationId'])
                if status != 200 or not scope_matches(body, fixture, config['organizationId']):
                    outcomes.append({'path': coverage_path(fixture), 'status': status, 'qualification': 'Unavailable or different current retained evaluation; not turned into coverage.'})
                    continue
                axes = set()
                for entry in body.get('entries', []):
                    for source in entry.get('sourceRefs', []):
                        evidence = source.get('evidence', {})
                        for key in ['content', 'pin', 'lifecycle']:
                            if isinstance(evidence.get(key), str):
                                axes.add(key + ':' + evidence[key])
                wanted = {axis for axis in axes if axis in ['content:non-substantive', 'content:undetermined', 'pin:mismatch', 'pin:unpinned', 'pin:unverifiable', 'lifecycle:draft', 'lifecycle:unverified']}
                if wanted - seen:
                    fixture['observedEvidenceAxes'] = sorted(axes)
                    selected.append(fixture)
                    seen.update(wanted)
                if len(selected) >= 6:
                    return selected, outcomes
    return selected, outcomes

def visual_case(context, page, config, fixture, variant, output, traffic):
    label = variant['name'] + '-' + fixture['name']
    manifest_start = len(traffic['manifests'])
    result = {'case': label, 'programId': fixture['programId'], 'submissionId': fixture['submissionId'], 'sequenceId': fixture['sequenceId'], 'variant': variant['name'], 'screenshots': [], 'qualification': 'Actual persisted native QA identities through the real development-auth UI; structural coverage, not filing approval.'}
    page.goto(config['baseUrl'] + '/concept2cure/submission-center?' + urlencode({'program': fixture['programId']}), wait_until='domcontentloaded', timeout=60000)
    selector = page.get_by_role('combobox', name='Submission to work on', exact=True)
    selector.wait_for(timeout=45000)
    selector.select_option(str(fixture['submissionId']))
    page.get_by_role('tab', name='Required deliverables', exact=True).click()
    sequence = page.get_by_role('combobox', name='Working sequence', exact=True)
    sequence.wait_for(timeout=45000)
    sequence.select_option(str(fixture['sequenceId']))
    card = page.locator('.pj-card').filter(has_text='Required deliverables · sequence')
    card.wait_for(timeout=45000)
    if fixture['expectedUnsupported']:
        card.get_by_text(re.compile('coverage catalogue.*not available', re.I)).wait_for(timeout=45000)
        assert card.get_by_role('button', name='Open Validation', exact=True).is_visible()
        assert card.get_by_role('button', name='Open saved document', exact=True).count() == 0
        result['coverage'] = 'Catalogue unavailable for this recorded IND; existing Validation remains offered.'
    else:
        page.wait_for_function("() => [...document.querySelectorAll('.pj-card')].some(card => card.textContent.includes('Required deliverables · sequence') && card.querySelector('table.ub-inv'))", timeout=45000)
        matching = [record for record in traffic['manifests'][manifest_start:] if record.get('status') == 200 and scope_matches(record.get('body'), fixture, config['organizationId'])]
        assert matching, 'No actual UI response matched the exact retained scope.'
        body = matching[-1]['body']
        card_text = card.inner_text()
        expected_framework = body.get('framework')
        assert isinstance(expected_framework, str) and expected_framework in card_text
        assert 'does not approve the documents or clear the submission for dispatch' in card_text
        expected_labels = {'present': 'Present', 'missing': 'Missing', 'optional-absent': 'Optional absent', 'undetermined': 'Undetermined', 'not-applicable': 'Not applicable'}
        for entry in body.get('entries', []):
            assert entry['label'] in card_text
            assert expected_labels[entry['status']] in card_text
        source_refs = [source for entry in body.get('entries', []) for source in entry.get('sourceRefs', [])]
        actual_links = [source['editor'] for source in source_refs if source.get('editor') is not None]
        if not actual_links:
            assert card.get_by_role('button', name='Open saved document', exact=True).count() == 0
        result['scope'] = body['scope']
        result['totals'] = body.get('totals')
        result['statuses'] = dict(collections.Counter(entry['status'] for entry in body.get('entries', [])))
        result['sourceEvidence'] = [{'leafId': source.get('leafId'), 'label': source.get('label'), 'document': source.get('document'), 'evidence': source.get('evidence'), 'editor': source.get('editor')} for source in source_refs]
        result['editorLinks'] = {'actualSavedTargets': len(actual_links), 'qualification': 'Only exact sourceRefs.editor from actual admitted source data may expose a link. No alias was created for this review.'}
        result['coverage'] = 'Actual structural/content response reflected; approval/dispatch remains separate.'
    page.wait_for_timeout(200)
    result['viewportWidth'] = variant['width']
    result['bodyWidth'] = page.evaluate('document.body.scrollWidth')
    result['darkClass'] = page.evaluate('document.documentElement.classList.contains("dark") || document.body.classList.contains("dark")')
    result['shellTheme'] = page.locator('.c2c-v2').get_attribute('data-theme')
    result['backgroundColor'] = page.locator('.c2c-v2').evaluate('(element) => getComputedStyle(element).backgroundColor')
    result['tableWidths'] = card.locator('.cm-matrix').evaluate_all('(nodes) => nodes.map(element => ({client:element.clientWidth,scroll:element.scrollWidth}))')
    result['cardText'] = card.inner_text()
    page.screenshot(path=str(output / (label + '-page.png')), full_page=True)
    card.screenshot(path=str(output / (label + '-card.png')))
    result['screenshots'] = [label + '-page.png', label + '-card.png']
    assert result['bodyWidth'] <= variant['width'], 'The body overflows the actual viewport.'
    assert result['darkClass'] is variant['dark'], 'The actual theme class does not match the requested existing preference.'
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root-approved', action='store_true')
    parser.add_argument('--discover-existing', action='store_true')
    args = parser.parse_args()
    if not args.root_approved:
        raise SystemExit('Prepared only; root must grant actual QA browser execution after compiler/build gates.')
    os.umask(0o077)
    config = json.loads((FOLDER / 'fixture-identities.json').read_text())
    runtime = pathlib.Path((FOLDER / 'current-runtime-path.txt').read_text().strip())
    metadata = json.loads((runtime / 'process-metadata.json').read_text())
    posture = json.loads((runtime / 'runtime-posture.json').read_text())
    assert metadata['database'] == config['database'] == posture['database']
    assert posture['role'] == 'app_service' and posture['rolsuper'] is False and posture['rolbypassrls'] is False
    output = FOLDER / ('review-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(os.getpid()))
    output.mkdir(mode=0o700)
    summary = {'qualification': 'Actual retained d25 fixture browser review with canonical development-only auth, no response mocking. Not full app boot, per-browser request-q instrumentation, production MFA, complete CTD, agency or clinical readiness.', 'database': config['database'], 'organizationId': config['organizationId'], 'ownerId': config['ownerId'], 'runtimeMetadata': str(runtime / 'process-metadata.json'), 'bootPosture': posture, 'nativeActualRequestProof': config['observationPath'], 'nativeObservationsSha256': config['observationSha256'], 'variants': [], 'discoveredRetainedCases': [], 'errors': [], 'pageErrors': [], 'consoleErrors': [], 'apiFailures': [], 'nonReadRequests': [], 'manifests': []}
    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        login_context = browser.new_context()
        login = login_context.request.post(config['baseUrl'] + '/api/auth/dev-login', data={'email': config['ownerEmail']}, timeout=45000)
        if login.status != 200:
            raise RuntimeError('Canonical existing-owner development login was refused; no alternative credentials created.')
        session = login.json()
        if session.get('success') is not True or not session.get('accessToken') or str(session.get('user', {}).get('id')) != str(config['ownerId']) or str(session['user'].get('organizationId')) != str(config['organizationId']):
            raise RuntimeError('Development auth returned a different or incomplete existing identity.')
        token = session['accessToken']
        summary['authentication'] = {'mode': 'Canonical /api/auth/dev-login, ALLOW_DEV_AUTH=1 plus development mode', 'userId': session['user']['id'], 'organizationId': session['user']['organizationId'], 'roles': session['user'].get('roles', []), 'mfaQualification': 'Development shortcut bypasses MFA; production MFA evidence is separate.', 'noCredentialOrTokenArtifactWritten': True}
        fixtures = list(config['fixtures'])
        if args.discover_existing:
            discovered, outcomes = discover(login_context, config, token)
            fixtures += discovered
            summary['discoveredRetainedCases'] = discovered
            summary['discoveryLimits'] = outcomes
        login_context.close()
        expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=session.get('expiresIn', 3600))).isoformat()
        auth = {'trialsage_access_token': token, 'trialsage_refresh_token': session.get('refreshToken', ''), 'trialsage_token_expiry': expiry, 'trialsage_user': json.dumps(session['user'])}
        for variant in config['variants']:
            context = browser.new_context(viewport={'width': variant['width'], 'height': variant['height']}, device_scale_factor=1, color_scheme='dark' if variant['dark'] else 'light')
            preferences = {'dark': variant['dark'], 'railCollapsed': True, 'anaMode': 'standard', 'anaRunPolicy': 'manual', 'segment': 'medtech', 'welcomeDismissed': True, 'liveDrive': False, 'liveDriveDefault': 2}
            # Only the actual login response populates the established auth keys.
            # No storageState, HAR, trace or session file may persist the token.
            context.add_init_script('((auth,prefs)=>{for(const[key,value]of Object.entries(auth)){localStorage.setItem(key,value);sessionStorage.setItem(key,value)}localStorage.setItem("c2c-v2-prefs",JSON.stringify(prefs))})(' + json.dumps(auth) + ',' + json.dumps(preferences) + ')')
            page = context.new_page()
            page.on('pageerror', lambda error: summary['pageErrors'].append(safe_error(error)))
            page.on('console', lambda message: summary['consoleErrors'].append(safe_error(message.text)) if message.type == 'error' else None)
            page.on('request', lambda request: summary['nonReadRequests'].append({'method': request.method, 'path': urlparse(request.url).path}) if '/api/' in request.url and request.method not in ['GET', 'HEAD', 'OPTIONS'] else None)
            def observe(response):
                path = urlparse(response.url).path
                if '/api/' not in path:
                    return
                if response.status >= 400:
                    summary['apiFailures'].append({'path': path, 'status': response.status})
                if path.endswith('/pathway-manifest'):
                    try:
                        body = retained_manifest(response.json())
                    except Exception:
                        body = None
                    summary['manifests'].append({'path': path, 'query': urlparse(response.url).query, 'status': response.status, 'body': body})
            page.on('response', observe)
            for fixture in fixtures:
                try:
                    case = visual_case(context, page, config, fixture, variant, output, summary)
                    summary['variants'].append({**case, 'passed': True})
                except Exception as error:
                    summary['errors'].append({'variant': variant['name'], 'case': fixture['name'], 'failure': safe_error(error)})
                    page.screenshot(path=str(output / (variant['name'] + '-' + fixture['name'] + '-failure.png')), full_page=True)
            context.close()
        browser.close()
    dangerous = ['/sign', '/freeze', '/dispatch', '/transmit', '/leaves', '/authoring/docs', '/docs/import']
    summary['unexpectedGovernedWriteRequests'] = [request for request in summary['nonReadRequests'] if any(part in request['path'] for part in dangerous)]
    summary['passed'] = not summary['errors'] and not summary['pageErrors'] and not summary['unexpectedGovernedWriteRequests']
    summary['limitations'] = ['Background real API failures/non-read requests are recorded rather than replaced. The script clicks only tabs/selectors and calls live read endpoints plus the explicitly authorized development login.', 'Dynamic draft/pin/unknown cases are captured only if positively found in admitted retained records; absent states are not fabricated.', 'Native actual request-q/late-admission proof is retained separately; boot role posture is not per-browser request instrumentation.', 'Actual exact-editor targets are not created by this review; no retained authoring alias means reference-only is the correct result.']
    for artifact in output.glob('*.png'):
        artifact.chmod(0o600)
    summary['artifacts'] = [{'path': str(artifact), 'bytes': artifact.stat().st_size, 'digestAlgorithm': 'sha256', 'digest': hashlib.sha256(artifact.read_bytes()).hexdigest()} for artifact in sorted(output.glob('*.png'))]
    (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({'passed': summary['passed'], 'output': str(output), 'casesPassed': sum(case['passed'] for case in summary['variants']), 'casesFailed': len(summary['errors']), 'variants': len(config['variants']), 'pageErrors': len(summary['pageErrors']), 'actualBackgroundApiFailures': len(summary['apiFailures']), 'unexpectedGovernedWrites': len(summary['unexpectedGovernedWriteRequests'])}))
    raise SystemExit(0 if summary['passed'] else 1)

if __name__ == '__main__':
    main()

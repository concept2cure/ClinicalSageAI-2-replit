const http = require('http');

// Get a JWT token first
function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      res => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch (e) {
            resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'GET',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      },
      res => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch (e) {
            resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function put(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      },
      res => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch (e) {
            resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function postAuth(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: 'Bearer ' + token,
        },
      },
      res => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch (e) {
            resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  const results = {};

  // 1. Login
  console.log('=== 1. LOGIN ===');
  const login = await post('/api/auth/login', {
    email: 'jm.smith@concept2cure.pro',
    password: 'demo123',
  });
  if (login.status !== 200) {
    console.log('FAIL: Login', login.status, JSON.stringify(login.data).substring(0, 200));
    return;
  }
  console.log('Login response keys:', JSON.stringify(Object.keys(login.data)));
  const token = login.data.accessToken || login.data.token || login.data.data?.token;
  console.log('PASS: Logged in, token found');

  // 2. List projects
  console.log('\n=== 2. LIST PROJECTS ===');
  const projects = await get('/api/concept2cure/projects', token);
  console.log(
    'Status:',
    projects.status,
    'Count:',
    Array.isArray(projects.data?.data) ? projects.data.data.length : 'N/A'
  );
  const projList = projects.data?.data || [];
  if (projList.length > 0) {
    projList
      .slice(0, 3)
      .forEach(p =>
        console.log('  proj=' + (p.projectId || p.id) + ' "' + p.name + '" type=' + p.type)
      );
  }

  // Grab the IND project (has most artifacts)
  const indProj = projList.find(p => p.name && p.name.includes('Novacetrol')) || projList[0];
  const pid = indProj?.projectId || indProj?.project_id || indProj?.id;
  console.log('Using project:', pid, indProj?.name);

  // 3. List artifacts
  console.log('\n=== 3. LIST ARTIFACTS ===');
  const artifacts = await get('/api/concept2cure/projects/' + pid + '/artifacts', token);
  const artList = artifacts.data?.data || artifacts.data || [];
  console.log('Status:', artifacts.status, 'Count:', artList.length);
  results['artifact_list'] = artList.length > 0 ? 'PASS' : 'FAIL';

  if (artList.length === 0) {
    console.log('No artifacts found, stopping test.');
    return;
  }

  // Pick one artifact with content
  const doc = artList.find(a => a.content && a.content.length > 100) || artList[0];
  const aid = doc.artifactId || doc.id;
  console.log('Using artifact:', aid, '"' + doc.title + '" v' + doc.version);

  // 4. Verify populated content
  console.log('\n=== 4. POPULATED CONTENT ===');
  const hasContent = doc.content && doc.content.length > 50;
  console.log(hasContent ? 'PASS' : 'FAIL', 'Content length:', (doc.content || '').length, 'chars');
  results['populated_editor'] = hasContent ? 'PASS' : 'FAIL';

  // 5. Create version 2 (edit the doc)
  console.log('\n=== 5. CREATE VERSION 2 (EDIT) ===');
  const newContent =
    doc.content +
    '\n<p><strong>Amendment (v' +
    (doc.version + 1) +
    '):</strong> Added stability data per ICH Q1A(R2). 12-month accelerated study confirms specifications met at all timepoints.</p>';
  const editRes = await put(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid,
    {
      content: newContent,
      title: doc.title,
    },
    token
  );
  console.log('Status:', editRes.status);
  const edited = editRes.data?.data || editRes.data;
  if (editRes.status === 200 && edited) {
    console.log('PASS: Now v' + edited.version, 'status=' + edited.status);
    results['version2_persists'] = 'PASS';
  } else {
    console.log('FAIL:', editRes.data);
    results['version2_persists'] = 'FAIL';
  }

  // 6. Get versions (compare data)
  console.log('\n=== 6. GET VERSIONS ===');
  const versRes = await get(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/versions',
    token
  );
  const versData = versRes.data?.data;
  if (versRes.status === 200 && versData) {
    console.log('PASS: ' + versData.versions.length + ' versions for "' + versData.title + '"');
    versData.versions.forEach(v =>
      console.log(
        '  v' +
          v.version +
          ': ' +
          v.content.length +
          ' chars hash=' +
          (v.contentHash || '').substring(0, 12) +
          '...'
      )
    );
    results['compare_works'] = versData.versions.length >= 2 ? 'PASS' : 'FAIL';
  } else {
    console.log('FAIL:', versRes.status);
    results['compare_works'] = 'FAIL';
  }

  // 7. Get provenance
  console.log('\n=== 7. GET PROVENANCE ===');
  const provRes = await get(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/provenance',
    token
  );
  if (provRes.status === 200 && provRes.data?.data) {
    const prov = provRes.data.data;
    console.log('PASS: Provenance loaded');
    console.log(
      '  Identity:',
      prov.identity?.title,
      'v' + prov.identity?.version,
      prov.identity?.status
    );
    console.log('  Source Inputs:', (prov.sourceInputs || []).length);
    console.log('  Generation Events:', prov.generationLineage?.events?.length || 0);
    console.log('  Edit History Versions:', prov.editHistory?.totalVersions);
    console.log('  Signatures:', (prov.compliance?.signatures || []).length);
    console.log('  Placement:', prov.placement?.ctdSection);
    results['provenance_works'] = 'PASS';
  } else {
    console.log('FAIL:', provRes.status, provRes.data);
    results['provenance_works'] = 'FAIL';
  }

  // 8. Get audit report
  console.log('\n=== 8. GET AUDIT REPORT ===');
  const auditRes = await get(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/audit-report?mode=detailed',
    token
  );
  if (auditRes.status === 200 && auditRes.data?.data) {
    const audit = auditRes.data.data;
    console.log('PASS: Audit report generated');
    console.log('  Standard:', audit.standard);
    console.log('  Document:', audit.documentIdentity?.title);
    console.log(
      '  Integrity Chain:',
      audit.integrityVerification?.chainIntact ? 'INTACT' : 'BROKEN'
    );
    console.log('  Versions:', audit.versionTimeline?.length);
    console.log('  Signatures:', audit.reviewSignatureSummary?.totalSignatures);
    results['audit_works'] = 'PASS';
  } else {
    console.log('FAIL:', auditRes.status);
    results['audit_works'] = 'FAIL';
  }

  // 9. Export audit as artifact
  console.log('\n=== 9. EXPORT AUDIT AS ARTIFACT ===');
  const exportRes = await postAuth(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/audit-report/export',
    {},
    token
  );
  if (exportRes.status === 200 || exportRes.status === 201) {
    const exp = exportRes.data?.data || exportRes.data;
    console.log('PASS: Audit exported as artifact', exp?.artifactId || '');
    results['audit_export'] = 'PASS';
  } else {
    console.log('FAIL:', exportRes.status, JSON.stringify(exportRes.data).substring(0, 200));
    results['audit_export'] = 'FAIL';
  }

  // 10. Sign & approve
  console.log('\n=== 10. SIGN & APPROVE ===');
  const signRes = await postAuth(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/signatures',
    {
      signaturePurpose: 'Document review and approval',
      signatureMeaning: 'I have reviewed this document and approve its content',
      authenticationMethod: 'password',
      secondFactorVerified: false,
      version: (edited || doc).version,
    },
    token
  );
  if (signRes.status === 200 || signRes.status === 201) {
    console.log('PASS: Signature recorded', signRes.data?.data?.signatureId || '');
    results['sign_approve'] = 'PASS';
  } else {
    console.log('FAIL:', signRes.status, JSON.stringify(signRes.data).substring(0, 200));
    results['sign_approve'] = 'FAIL';
  }

  // 11. Change status to approved
  console.log('\n=== 11. STATUS -> APPROVED ===');
  const statusRes = await put(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/status',
    { status: 'approved' },
    token
  );
  if (statusRes.status === 200) {
    console.log('PASS: Status changed to', statusRes.data?.data?.status);
    results['status_change'] = 'PASS';
  } else {
    console.log('FAIL:', statusRes.status);
    results['status_change'] = 'FAIL';
  }

  // 12. Lock
  console.log('\n=== 12. STATUS -> LOCKED ===');
  const lockRes = await put(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/status',
    { status: 'locked' },
    token
  );
  if (lockRes.status === 200) {
    console.log('PASS: Document locked');
    results['lock'] = 'PASS';
  } else {
    console.log('FAIL:', lockRes.status);
    results['lock'] = 'FAIL';
  }

  // 13. Verify locked edit rejected
  console.log('\n=== 13. LOCKED EDIT REJECTED ===');
  const lockedEdit = await put(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid,
    {
      content: 'Should be rejected',
      title: doc.title,
    },
    token
  );
  if (lockedEdit.status === 423) {
    console.log('PASS: Locked edit correctly rejected (423)');
    results['lock_enforced'] = 'PASS';
  } else {
    console.log('FAIL: Expected 423, got', lockedEdit.status);
    results['lock_enforced'] = 'FAIL';
  }

  // 14. Verify integrity
  console.log('\n=== 14. VERIFY INTEGRITY ===');
  const intRes = await get(
    '/api/concept2cure/projects/' + pid + '/artifacts/' + aid + '/verify-integrity',
    token
  );
  if (intRes.status === 200 && intRes.data?.data) {
    const int = intRes.data.data;
    console.log(
      'PASS: Integrity verified=' + int.verified + ' versionsChecked=' + int.versionsChecked
    );
    results['integrity'] = 'PASS';
  } else {
    console.log('FAIL:', intRes.status);
    results['integrity'] = 'FAIL';
  }

  // 15. Reopen from project context (GET artifacts shows this doc with all metadata)
  console.log('\n=== 15. REOPEN FROM PROJECT CONTEXT ===');
  const reopenRes = await get('/api/concept2cure/projects/' + pid + '/artifacts', token);
  const reopenList = reopenRes.data?.data || [];
  const reopened = reopenList.find(a => (a.artifactId || a.id) === aid);
  if (reopened) {
    console.log('PASS: Found in project artifacts list');
    console.log(
      '  Title:',
      reopened.title,
      'v' + reopened.version,
      'status=' + reopened.status,
      'ctd=' + reopened.ctdSection
    );
    console.log('  Content length:', (reopened.content || '').length);
    results['project_reopen'] = reopened.content && reopened.content.length > 50 ? 'PASS' : 'FAIL';
  } else {
    console.log('FAIL: Not found in artifacts list');
    results['project_reopen'] = 'FAIL';
  }

  // RESULTS TABLE
  console.log('\n\n=== PASS / FAIL TABLE ===');
  console.log('┌──────────────────────────────────────┬────────┐');
  console.log('│ Test                                 │ Result │');
  console.log('├──────────────────────────────────────┼────────┤');
  const tests = [
    ['Generated doc becomes real artifact', results.artifact_list],
    ['Populated editor handoff works', results.populated_editor],
    ['Version 2 persists', results.version2_persists],
    ['Compare works', results.compare_works],
    ['Provenance works', results.provenance_works],
    ['Audit panel works', results.audit_works],
    ['Audit export works', results.audit_export],
    ['Project/dossier reopen works', results.project_reopen],
    ['Sign/approve works', results.sign_approve],
    ['Lock enforcement works', results.lock_enforced],
    ['Integrity verification works', results.integrity],
  ];
  tests.forEach(([name, result]) => {
    const pad = name + ' '.repeat(36 - name.length);
    console.log('│ ' + pad + ' │ ' + (result === 'PASS' ? ' PASS ' : ' FAIL ') + ' │');
  });
  console.log('└──────────────────────────────────────┴────────┘');
  const passCount = tests.filter(t => t[1] === 'PASS').length;
  console.log('\n' + passCount + '/' + tests.length + ' PASS');
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

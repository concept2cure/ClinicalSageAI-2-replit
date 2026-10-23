"""Independent reader for the downloaded eCTD ZIPs (Python stdlib only; not the product's code).

Re-verifies util/index-md5.txt against the zipped bytes, lists every leaf with its
operation, href, checksum and modified-file, resolves each modified-file pointer
against the earlier package's backbone IDs, and prints the us-regional identity.
Usage: python3 -I inspect_packages.py <earlier.zip> [<later.zip> ...]
"""
import hashlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

XLINK = '{http://www.w3.org/1999/xlink}'


def strip_doctype(raw: bytes) -> bytes:
    # The DOCTYPE names DTDs that are not shipped; ElementTree does not fetch them,
    # but drop it so a missing external subset cannot matter.
    return re.sub(rb'<!DOCTYPE[^>]*>', b'', raw, count=1)


def leaves(root):
    for el in root.iter():
        if el.tag.endswith('leaf'):
            yield el


def inspect(path, earlier_ids):
    print(f'\n== {path}')
    z = zipfile.ZipFile(path)
    names = z.namelist()
    print(f'   {len(names)} entries')
    for n in names:
        print(f'     {n}  ({z.getinfo(n).file_size} bytes)')
    prefix = ''
    idx = [n for n in names if n.endswith('index.xml') and n.count('/') <= 1]
    if idx and '/' in idx[0]:
        prefix = idx[0].rsplit('/', 1)[0] + '/'
    md5_name = prefix + 'util/index-md5.txt' if prefix + 'util/index-md5.txt' in names else None
    ok = bad = 0
    if md5_name:
        for line in z.read(md5_name).decode().splitlines():
            if not line.strip():
                continue
            digest, _, rel = line.strip().partition('  ')
            if not rel:
                parts = line.split()
                digest, rel = parts[0], parts[-1]
            entry = prefix + rel.lstrip('./')
            if entry not in names:
                print(f'     MISSING {rel}')
                bad += 1
                continue
            actual = hashlib.md5(z.read(entry)).hexdigest()
            if actual == digest.lower():
                ok += 1
            else:
                bad += 1
                print(f'     MISMATCH {rel}: listed {digest} actual {actual}')
        print(f'   util/index-md5.txt: {ok} verified, {bad} mismatched/missing')
    ids = {}
    for backbone in [n for n in names if n.endswith('index.xml') or n.endswith('us-regional.xml')]:
        root = ET.fromstring(strip_doctype(z.read(backbone)))
        for leaf in leaves(root):
            lid = leaf.get('ID')
            ids[lid] = backbone
            op = leaf.get('operation')
            href = next((v for k, v in leaf.attrib.items() if k.endswith('}href') or k == 'href'), None)
            mod = leaf.get('modified-file')
            checksum = leaf.get('checksum')
            title = ''.join(t.text or '' for t in leaf if t.tag.endswith('title')).strip()
            line = f'   leaf [{backbone.split("/")[-1]}] op={op} id={lid} href={href} md5={checksum}'
            if mod:
                line += f' modified-file={mod}'
                target = mod.split('#', 1)[1] if '#' in mod else None
                line += f'  -> resolves to earlier leaf: {target in earlier_ids if target else False}'
            print(line + (f'  "{title}"' if title else ''))
            if href:
                entry = prefix + href if not href.startswith('../') else None
                if entry and backbone.endswith('us-regional.xml'):
                    entry = prefix + 'm1/us/' + href
                if entry and entry in names and checksum:
                    actual = hashlib.md5(z.read(entry)).hexdigest()
                    print(f'      checksum matches shipped bytes: {actual == checksum}')
                    if z.read(entry)[:5] == b'%PDF-':
                        head = z.read(entry)[:2048]
                        print(f'      %PDF magic: yes; /Encrypt in trailer region: {b"/Encrypt" in z.read(entry)[-4096:]}')
        if backbone.endswith('us-regional.xml'):
            raw = z.read(backbone).decode('utf-8', 'replace')
            for tag in ('application-number', 'applicant-info', 'submission-type', 'submission-sub-type', 'sequence-number', 'applicant-contact-name', 'telephone', 'email', 'company-name', 'id'):
                for m in re.finditer(rf'<{tag}\b[^>]*>(.*?)</{tag}>', raw, re.S):
                    print(f'   us-regional <{tag}{m.group(0)[len(tag)+1:m.group(0).index(">")]}>: {m.group(1).strip()[:160]}')
            print('   us-regional root attributes / DOCTYPE:', re.search(r'<!DOCTYPE[^>]*>', raw).group(0) if re.search(r'<!DOCTYPE[^>]*>', raw) else '(none)')
    return ids


earlier = set()
for p in sys.argv[1:]:
    earlier |= set(inspect(p, earlier).keys())

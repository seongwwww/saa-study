"""Extract the user's PDF locally. Password is never written to the dataset."""
import argparse
import collections
import getpass
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
import pymupdf

def clean(text):
    # Restore wrapped URLs before joining ordinary PDF lines.
    text = re.sub(r'(https?://\S+)\s*\n(?=[a-zA-Z0-9_/?#&=%.~-]+(?:\s|$))', r'\1', text)
    return re.sub(r'\s+', ' ', text).strip().replace('\u00ad', '')

def extract(source, password, output):
    doc = pymupdf.open(source)
    if doc.needs_pass and not doc.authenticate(password):
        raise ValueError('PDF 비밀번호가 올바르지 않습니다.')
    output.mkdir(parents=True, exist_ok=True)
    (output/'images').mkdir(exist_ok=True)
    page_texts = []
    image_count = 0
    for page_index, page in enumerate(doc):
        parts, lines = [], []
        blocks = page.get_text('dict')['blocks']
        for block in blocks:
            if block['type'] == 0:
                for line in block['lines']:
                    text = ''.join(span['text'] for span in line['spans'])
                    if text.strip():
                        lines.append((line['bbox'], text))
                        parts.append((line['bbox'][1], line['bbox'][0], text))
        for block_index, block in enumerate(blocks):
            if block['type'] == 1:
                name = f'page-{page_index+1}-{block_index}.{block["ext"]}'
                (output/'images'/name).write_bytes(block['image'])
                y = block['bbox'][1]
                # Some image-only choices have their A/B/C/D label aligned to
                # the image bottom. Keep the label before its image.
                for bbox, text in lines:
                    if re.fullmatch(r'\s*[A-F]\.\s*', text) and bbox[2] <= block['bbox'][0]+2 and block['bbox'][1] <= bbox[1] < block['bbox'][3]:
                        y = bbox[1]+0.1
                parts.append((y, block['bbox'][0], f'[[image:images/{name}]]'))
                image_count += 1
        page_texts.append('\n'.join(part[2] for part in sorted(parts)))
    starts, full = [], ''
    for page in page_texts:
        starts.append(len(full))
        full += page + '\n'
    headers = list(re.finditer(r'(?m)^\s*Q\s*(\d+)\s*$', full))
    questions, issues = [], []
    if not headers:
        raise ValueError('No Q1/Q2 question headings found. Text-based PDFs only; see README.md.')
    for index, header in enumerate(headers):
        end = headers[index+1].start() if index+1 < len(headers) else len(full)
        body = full[header.end():end]
        if body.count('Answer:') != 1:
            issues.append({'index': index+1, 'error': 'expected exactly one Answer: marker'})
        answer = re.search(r'Answer:\s*([A-F](?:\s*,\s*[A-F])*)', body)
        if not answer:
            issues.append({'index': index+1, 'error': 'missing answer'})
            continue
        before, after = body[:answer.start()], body[answer.end():]
        options = list(re.finditer(r'(?m)^\s*([A-F])\.\s*', before))
        choices = [{'key': o.group(1), 'text': clean(before[o.end():options[j+1].start() if j+1<len(options) else len(before)])} for j,o in enumerate(options)]
        correct = re.findall(r'[A-F]', answer.group(1))
        page_start = max(i for i,s in enumerate(starts) if s <= header.end()) + 1
        page_end = max(i for i,s in enumerate(starts) if s < end) + 1
        # Preserve explanation paragraphs and references without interpreting them.
        explanation = re.search(r'설명\s*\d*\s*[:：]', after)
        source_links = []
        for link in re.findall(r'https?://\S+', clean(after[:explanation.start()] if explanation else after)):
            source_links.append(link)
        paragraphs = []
        if explanation:
            content = after[explanation.end():].strip('・ \r\n')
            content = clean(content)
            paragraphs = [p.strip('・ ') for p in re.split(r'(?<=다\.)\s+|(?=설명\s*\d+\s*:)', content) if p.strip('・ ')]
        else:
            remaining = re.sub(r'https?://\S+', '', clean(after)).strip()
            if remaining:
                paragraphs = [remaining]
        q = {'id': f'saa-{index+1:04d}', 'number': index+1, 'sourceNumber': int(header.group(1)), 'pageStart': page_start, 'pageEnd': page_end,
             'prompt': clean(before[:options[0].start()]) if options else clean(before), 'choices': choices,
             'answer': correct, 'explanation': paragraphs, 'links': source_links}
        if len(choices)<4 or any(not c['text'] for c in choices) or len({c['key'] for c in choices}) != len(choices) or not set(correct)<=set(c['key'] for c in choices):
            issues.append({'index': index+1, 'error': 'invalid choices', 'keys':[c['key'] for c in choices], 'answer': correct})
        questions.append(q)
    numbers = [q['sourceNumber'] for q in questions]
    audit = {'pages': len(doc), 'questions': len(questions), 'answers': full.count('Answer:'), 'images': image_count, 'questionsWithImages': [q['number'] for q in questions if '[[image:' in json.dumps(q)], 'multiAnswer': sum(len(q['answer'])>1 for q in questions),
             'missingSourceNumbers': [n for n in range(1,max(numbers, default=0)+1) if n not in numbers], 'duplicateSourceNumbers': [n for n,c in collections.Counter(numbers).items() if c>1],
             'withoutExplanation': [q['number'] for q in questions if not q['explanation']], 'issues': issues}
    output.mkdir(parents=True, exist_ok=True)
    (output.parent/'extraction-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(audit, ensure_ascii=False, indent=2))
    if issues:
        raise ValueError('Extraction has issues. Inspect extraction-audit.json before use.')
    dataset_id = 'pdf-' + hashlib.sha256(source.read_bytes()).hexdigest()[:16]
    for question in questions:
        question['id'] = f'{dataset_id}-{question["number"]:04d}'
    (output/'questions.json').write_text(json.dumps({'version': 1, 'id': dataset_id, 'title': 'AWS SAA-C03', 'sourceFile': source.name, 'questions': questions}, ensure_ascii=False), encoding='utf-8')
    shutil.copy2(source, output/'source.pdf')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--password')
    parser.add_argument('--output', type=Path, default=Path('public'))
    args = parser.parse_args()
    with pymupdf.open(args.source) as doc:
        password = args.password if args.password is not None else getpass.getpass('PDF password: ') if doc.needs_pass else ''
    # Validate in a staging directory, so a failed import leaves the current
    # local question bank and its source images untouched.
    with tempfile.TemporaryDirectory(prefix='saa-import-') as temporary:
        staged = Path(temporary)/'public'
        try:
            extract(args.source, password, staged)
        finally:
            audit = staged.parent/'extraction-audit.json'
            if audit.exists():
                args.output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(audit, args.output.parent/'extraction-audit.json')
        args.output.mkdir(parents=True, exist_ok=True)
        shutil.copytree(staged/'images', args.output/'images', dirs_exist_ok=True)
        shutil.copy2(staged/'source.pdf', args.output/'source.pdf')
        shutil.copy2(staged/'questions.json', args.output/'questions.json')

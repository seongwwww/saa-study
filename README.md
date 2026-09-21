# SAA Study · 나의 AWS 공부방

답을 숨기고 풀어본 뒤, 틀린 문제를 다시 만나는 개인용 학습 앱입니다.
React · TypeScript · Vite · IndexedDB(Dexie)로 만들었습니다. 별도 계정이나 서버 DB가 필요하지 않습니다.

**공개 저장소에는 앱 코드와 직접 작성한 사용법 데모 3문제만 들어 있습니다.**
개인 PDF, 추출한 문제·정답·이미지, 비밀번호와 학습 기록은 포함하지 않습니다.
AWS 공식 서비스 또는 공식 문제집이 아닙니다.

## 빠른 시작

Node.js **22.14 이상**과 Git이 필요합니다. Windows, macOS, Linux에서 다음 명령을 실행하세요.

```sh
git clone https://github.com/seongwwww/saa-study.git
cd saa-study
npm ci
npm start
```

터미널에 표시되는 **http://127.0.0.1:4173/** 을 브라우저에서 엽니다.
`npm start`는 빌드 후 로컬 서버를 실행하며, `Ctrl+C`로 종료합니다.
첫 실행에는 데모 문제가 나오므로 PDF 없이도 모든 기능을 확인할 수 있습니다.

Fork했다면 자신의 저장소 주소로 clone하세요. Download ZIP으로 받았다면 압축을 풀고 그 폴더에서 `npm ci`부터 실행하면 됩니다.

Windows에서는 한 번 `npm ci`와 `npm run build`를 실행한 뒤 **공부방 열기.cmd**를 더블클릭해도 됩니다. 창을 닫아도 로컬 서버는 유지되며, PC를 재시작하면 다시 더블클릭해서 실행하세요. 코드를 변경하거나 새 PDF를 추가했을 때에는 먼저 다시 빌드하세요.

## 기능

- **공부하기**: 정답·해설 펼치기/접기. 답만 읽은 기록과 직접 푼 점수를 구분합니다.
- **문제 풀기**: 문제 수, 범위, 순서, 미풀이·오답·북마크 대상을 선택합니다. 정답은 제출한 뒤 공개됩니다.
- **오답노트**: 틀리거나 헷갈린 문제를 모아 다시 풉니다. 서로 다른 풀이에서 두 번 연속 맞히면 익숙해짐으로 분류하고, 과거 오답 이력은 유지합니다.
- **북마크와 메모**: 저장한 문제를 다시 찾고 개인 정리를 남깁니다.
- **이어풀기**: 답안, 현재 위치, 미완료 세트를 자동 저장합니다.
- **백업·복원**: 설정에서 기록을 JSON 파일로 옮길 수 있습니다. 복원 전에 확인 창을 표시합니다.
- **읽기 환경**: 글자 크기 조절, 모바일 대응, 코드·도표 이미지 지원.

## 내 PDF 가져오기

PDF 가져오기에만 **Python 3.10 이상**이 추가로 필요합니다. 본인이 사용할 수 있는 자료를 자신의 PC에서 변환하세요.

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/extract.py "C:\path\to\my-questions.pdf"
npm start
```

macOS / Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/extract.py "/path/to/my-questions.pdf"
npm start
```

암호화된 PDF는 터미널에서 비밀번호를 입력합니다. 비밀번호는 출력 데이터에 저장하지 않습니다. 이미 서버가 실행 중이면 종료한 다음 `npm start`로 다시 빌드하세요.

추출기는 **텍스트를 선택할 수 있는 PDF** 중 아래 형식에 맞춘 도구입니다. 모든 PDF의 자동 변환이나 OCR을 지원하지 않습니다.

```text
Q1
문제 지문
A. 첫 번째 보기
B. 두 번째 보기
C. 세 번째 보기
D. 네 번째 보기
Answer: A
설명:
해설 내용

Q2
...
Answer: A, C
```

문제 번호는 별도 줄에 `Q1`, `Q2`처럼 표시되고, 보기는 `A.`부터 `F.`까지 지원합니다. 문제당 `Answer:` 표기는 하나여야 하며, 여러 페이지에 걸친 문제와 삽입 이미지를 연결합니다. 추출 후에는 표·코드·페이지 경계가 있는 문제를 원본과 대조하세요. 원문에 쓰인 정답을 그대로 사용하며 사실 검증이나 정답 교정은 하지 않습니다.

생성되는 파일은 Git에서 제외됩니다:

| 경로 | 내용 |
| --- | --- |
| `public/questions.json` | 개인 문제 데이터 |
| `public/source.pdf` | 원본 PDF 사본 |
| `public/images/` | 문제·보기·해설의 이미지 |
| `extraction-audit.json` | 중복 번호, 누락, 추출 구조 검사 |

추출이 실패하면 기존 문제집을 유지합니다. 서로 다른 PDF와 데모는 별도 학습 공간을 사용합니다. 동일 PDF 파일을 다시 가져오면 같은 문제집으로 인식합니다. PDF 파일을 수정하면 새 문제집으로 취급합니다.

## 직접 문제 데이터 작성하기

`src/demo-bank.json`을 참고해 `public/questions.json`을 만들 수도 있습니다.

- 최상위 `version: 1`, 고유한 `id`, `title`, `questions`가 필요합니다.
- 각 문제의 `id`는 고유해야 하며 `number`는 1부터 순서대로 작성합니다.
- `choices`의 키는 A–F, `answer`는 그 키의 배열입니다.
- `explanation`과 `links`는 문자열 배열입니다.
- 원본 PDF가 없으면 `pageStart`, `pageEnd`를 0으로 설정합니다.
- 이미지는 텍스트 중 `[[image:images/example.png]]`로 넣고 해당 파일을 `public/images/`에 저장합니다.

문제집을 바꿀 때는 새 `id`를 지정해 학습 기록이 섞이지 않게 하세요. 같은 문제집의 문제 ID는 유지해야 합니다.

## 기록과 백업

학습 기록은 현재 브라우저의 IndexedDB에 저장됩니다. **같은 PC여도 Chrome, Edge, Codex 미리보기는 각각 별도 기록**입니다. `localhost`와 `127.0.0.1`, 서로 다른 포트도 별개이므로 항상 같은 주소와 브라우저를 사용하세요.

다른 브라우저/PC로 옮길 때에는 설정의 백업 파일을 사용하세요. 복원은 현재 문제집의 기록을 교체합니다. OneDrive나 GitHub로 소스 폴더를 동기화해도 브라우저 기록은 자동으로 따라가지 않습니다. 브라우저 데이터를 삭제하기 전에는 백업하세요.

앱은 인터넷 연결 없이 로컬에서 동작합니다. 최초 의존성 설치와 외부 참고 링크에는 인터넷이 필요합니다. 소스 PDF를 열 때에는 기존 PDF 비밀번호가 필요할 수 있습니다.

## 개발 및 기여

```sh
npm ci
npm run dev       # 개발 서버 · 127.0.0.1:4173
npm test          # 공개 데모로 채점, 오답, 백업 검증
npm run build     # TypeScript 검사 + 실행용 dist 생성
npm run preview   # 이미 빌드한 앱 실행
```

개발 서버와 실행용 서버는 같은 포트를 쓰므로 동시에 실행하지 마세요.
GitHub Actions는 Windows·macOS·Linux에서 테스트와 빌드를 수행합니다.

Fork → 브랜치 생성 → 변경 → `npm test`와 `npm run build` → Pull Request 순서로 기여할 수 있습니다. PR에는 개인 PDF, 추출 데이터, 백업, 비밀번호를 넣지 마세요. `git diff --cached`로 업로드 파일을 확인하세요.

## 라이선스

직접 작성한 앱 코드와 데모는 [MIT License](LICENSE)로 제공합니다. 의존성은 각자의 라이선스를 따르며, 개인이 가져온 문제집에는 이 라이선스가 적용되지 않습니다.

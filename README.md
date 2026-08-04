# REXONDEX Diary

날짜별 텍스트 기록을 소셜 피드와 달력으로 탐색하는 정적 개인 일기장입니다.

이 문서는 프로젝트의 사용 설명서이자 설계도입니다. 데이터 계약, 실행 구조, 계층별 책임, 화면 구조, 빌드 과정과 확장 지점을 현재 코드 기준으로 설명합니다.

## 1. 설계 목표

이 프로젝트는 다음 조건을 기준으로 설계되어 있습니다.

- 일기의 원본은 사람이 읽고 수정하기 쉬운 개별 텍스트 파일로 보관합니다.
- 파일명 자체가 기록 날짜이며 별도의 서버 데이터베이스를 사용하지 않습니다.
- 브라우저 실행 중에는 일기 파일을 `fetch`하지 않습니다.
- 로컬에서 `index.html`을 직접 열어도 작동해야 합니다.
- GitHub Pages에 별도 빌드 서버 없이 배포할 수 있어야 합니다.
- 기본 화면은 최신 글부터 읽는 소셜 피드입니다.
- 달력은 특정 날짜의 기록을 찾기 위한 보조 탐색 화면입니다.
- 데이터, 날짜 규칙, 상태, 화면과 테마의 책임을 분리합니다.
- 사람이 수정하는 원본과 브라우저가 실행하는 생성물을 명확히 구분합니다.

## 2. 전체 구조

```text
rexondex.github.io/
├─ database/                         원본 일기 파일
│  ├─ 260606                         2026-06-06 기록
│  ├─ 260607                         2026-06-07 기록
│  └─ ...
│
├─ src/                              사람이 수정하는 애플리케이션 소스
│  ├─ domain/
│  │  └─ diary.js                    날짜·ID·본문 메타데이터 규칙
│  ├─ infrastructure/
│  │  └─ static-diary-repository.js  정적 기록 조회와 파싱 캐시
│  ├─ application/
│  │  └─ archive-store.js            달력 상태와 상태 변경 이벤트
│  ├─ presentation/
│  │  ├─ archive-app.js              피드·달력·프로필·설정 UI
│  │  ├─ theme-manager.js            테마 정의와 저장
│  │  └─ styles/
│  │     ├─ tokens.css               테마 디자인 토큰
│  │     └─ app.css                  레이아웃과 컴포넌트 스타일
│  └─ main.js                        의존성 생성과 앱 조립
│
├─ tools/
│  ├─ build-database.ps1             database/* → database.js
│  └─ build-app.ps1                  src/* → app.js
│
├─ database.js                       생성된 브라우저용 기록 번들
├─ app.js                            생성된 브라우저용 앱 번들
├─ index.html                        정적 진입 문서
├─ rexondex.jpg                      사용자 프로필 이미지
├─ favicon.svg                       와이어프레임 다면체 사이트 아이콘
└─ README.md                         프로젝트 설계 문서
```

### 원본과 생성물

| 사람이 관리하는 원본 | 브라우저용 생성물 | 생성 명령 |
|---|---|---|
| `database/YYMMDD` | `database.js` | `tools/build-database.ps1` |
| `src/**/*.js` | `app.js` | `tools/build-app.ps1` |

일반적인 수정은 원본에서 해야 합니다. 생성물을 직접 수정하면 다음 빌드 때 덮어써집니다.

## 3. 실행 아키텍처

브라우저가 페이지를 여는 순서는 다음과 같습니다.

```text
index.html
  │
  ├─ 저장된 테마를 <html data-theme="...">에 선적용
  ├─ database.js 실행
  │    └─ window.ARCHIVE_DATABASE 생성
  ├─ marked CDN 로드 시도
  ├─ tokens.css + app.css 적용
  └─ app.js 실행
       ├─ createArchive(Object.keys(records))
       ├─ StaticDiaryRepository 생성
       ├─ ArchiveStore 생성
       ├─ ThemeManager 생성
       └─ ArchiveApp.mount()
```

런타임 기록 흐름은 다음과 같습니다.

```text
window.ARCHIVE_DATABASE
        │
        ▼
createArchive() ── 유효 날짜 선별, 정렬, 연도와 개수 계산
        │
        ├──────────────┐
        ▼              ▼
ArchiveStore     StaticDiaryRepository
달력 상태         본문 파싱·캐시
        │              │
        └──────┬───────┘
               ▼
          ArchiveApp
 피드 / 달력 / 프로필 / 설정
```

`app.js`는 ES 모듈을 순서대로 합친 일반 스크립트입니다. 따라서 `file://` 환경에서 ES 모듈 CORS 제한 없이 실행할 수 있습니다.

## 4. 데이터 설계

### 4.1 파일명 계약

원본 기록은 `database` 폴더 안에 확장자 없이 저장합니다.

```text
database/260804
```

파일명 규칙은 `YYMMDD`입니다.

| 구간 | 의미 | 예시 |
|---|---|---|
| `YY` | 2000년대 연도 | `26` → 2026년 |
| `MM` | 월 | `08` → 8월 |
| `DD` | 일 | `04` → 4일 |

파일명은 다음 두 단계를 모두 통과해야 합니다.

1. 정확히 숫자 6자리인지 확인합니다.
2. `20YY-MM-DD`가 실제로 존재하는 날짜인지 확인합니다.

예시:

- `260804`: 유효, 2026년 8월 4일
- `260229`: 무효, 2026년은 윤년이 아님
- `261332`: 무효, 13월 32일은 존재하지 않음
- `260804.txt`: 무효, 확장자가 붙어 있음

도메인의 `parseDiaryId()`와 데이터 빌드 스크립트가 각각 같은 형식 검증을 수행합니다.

### 4.2 본문 형식

파일 내용은 UTF-8 일반 텍스트 또는 Markdown으로 작성합니다.

```text
오늘 있었던 일을 기록한다.

문단은 빈 줄로 나눌 수 있다.
```

Markdown을 사용할 수도 있습니다.

```md
## 작은 제목

- 첫 번째 항목
- 두 번째 항목

> 인용문
```

`marked`가 로드되면 Markdown HTML로 변환합니다. 외부 CDN을 사용할 수 없는 환경에서는 일반 텍스트와 줄바꿈을 유지하는 기본 렌더러가 사용됩니다.

### 4.3 참고 링크 메타데이터

첫 줄 전체가 링크 형식이면 본문과 분리하여 참고 링크 카드로 표시합니다.

```md
[https://example.com]

이 줄부터 실제 본문입니다.
```

라벨이 있는 Markdown 링크도 지원합니다.

```md
[관련 자료](https://example.com)
```

지원하는 링크 형태:

- `https://...`
- `http://...`
- `mailto:...`
- `www.example.com`
- `example.com/path`
- `/`, `./`, `../`, `#`로 시작하는 로컬 경로

첫 줄이 유효한 링크가 아니면 전체 내용을 일반 본문으로 처리합니다.

### 4.4 브라우저용 데이터 번들

`database.js`의 계약은 다음과 같습니다.

```js
window.ARCHIVE_DATABASE = {
  "260804": "2026년 8월 4일의 기록",
  "260805": "첫 번째 줄\n두 번째 줄"
};
```

키는 기록 ID이고 값은 파일의 전체 문자열입니다. 이 객체의 키가 일기 목록 역할도 하므로 별도의 날짜 목록 파일은 없습니다.

## 5. 계층별 책임

### 5.1 Domain: `src/domain/diary.js`

브라우저 UI와 무관한 날짜 및 일기 규칙을 담당합니다.

| 함수 | 책임 |
|---|---|
| `parseDiaryId(id)` | 6자리 ID를 실제 `Date`로 변환하고 유효성을 검사 |
| `dateToDiaryId(date)` | `Date`를 `YYMMDD`로 변환 |
| `formatDate(date, weekday)` | 한국어 날짜 문자열 생성 |
| `parseDiaryMarkdown(source)` | BOM 제거, 첫 줄 참고 링크 추출, 본문 분리 |
| `createArchive(rawIds)` | 중복 제거, 정렬, 날짜 집합과 연도 통계 생성 |

`createArchive()`가 반환하는 아카이브 객체:

```js
{
  ids,       // 오름차순으로 정렬된 기록 ID 배열
  idSet,     // 기록 존재 여부를 빠르게 확인하는 Set
  dates,     // ID에 대응하는 Date 배열
  latest,    // 가장 최신 기록 날짜, 없으면 오늘
  years,     // 최신순 연도 배열
  count()    // 특정 연도 또는 월의 기록 개수
}
```

### 5.2 Infrastructure: `static-diary-repository.js`

정적 객체를 화면에서 사용할 기록 엔티티로 변환합니다.

`StaticDiaryRepository`의 책임:

- `window.ARCHIVE_DATABASE`의 얕은 복사본을 동결합니다.
- ID로 원문을 찾습니다.
- 도메인 파서를 통해 본문과 참고 링크를 분리합니다.
- 이미 파싱한 결과를 `Map`에 캐시합니다.
- 참고 링크가 포함된 ID 집합을 계산합니다.

공개 인터페이스:

```js
await repository.get(id);
// { id, markdown, reference }

await repository.findReferenceIds(ids);
// Set<string>
```

현재 구현은 메모리 정적 저장소이지만, UI는 저장 방식 자체를 알지 않습니다. 이후 검색 인덱스나 다른 저장소를 추가할 때 같은 인터페이스를 구현하면 됩니다.

### 5.3 Application: `archive-store.js`

달력 탐색 상태를 관리하는 이벤트 기반 저장소입니다.

상태:

```js
{
  year,          // 현재 달력 연도
  month,         // 현재 달력 월, 0부터 시작
  activeId,      // 선택된 기록 ID 또는 null
  referenceIds   // 참고 링크가 있는 기록 ID Set
}
```

메서드:

| 메서드 | 동작 |
|---|---|
| `view(year, month)` | 달력 연·월 변경 |
| `moveMonth(offset)` | 이전 또는 다음 달로 이동하며 연도 경계를 처리 |
| `open(id)` | 기록 선택과 달력 연·월 동기화 |
| `close()` | 기록 선택 해제 |
| `setReferences(ids)` | 참고 링크 ID 집합 갱신 |
| `adjacent(offset)` | 현재 기록의 이전·다음 ID 반환 |

상태 변경 시 `change` 사용자 이벤트를 발생시키며 프레젠테이션 계층이 이를 구독합니다.

### 5.4 Presentation: `archive-app.js`

화면 마크업 생성, 이벤트 연결, 기록 렌더링과 반응형 내비게이션을 담당합니다.

주요 의존성은 생성자 주입으로 전달됩니다.

```js
new ArchiveApp({
  root,
  archive,
  repository,
  store,
  themes
});
```

따라서 화면 코드는 전역 데이터의 구체적인 생성 과정을 직접 알 필요가 없습니다.

### 5.5 Composition Root: `src/main.js`

각 계층의 구현체를 만들고 연결하는 유일한 조립 지점입니다.

```text
전역 정적 데이터
→ 도메인 아카이브
→ 정적 저장소
→ 상태 저장소
→ 테마 관리자
→ 화면 앱
```

저장소 구현이나 루트 엘리먼트를 교체할 때 가장 먼저 확인할 파일입니다.

## 6. 화면 정보 구조

### 6.1 데스크톱

```text
┌──────────────┬──────────────────────────┬──────────────────┐
│ 좌측 메뉴     │ 가운데 주 화면             │ 우측 사용자 요약  │
│              │                          │                  │
│ rexondex     │ 일기 피드 / 달력 /        │ 프로필 이미지     │
│ 일기         │ 프로필 / 설정             │ 기록 통계         │
│ 달력         │                          │ SNS 링크          │
│ 프로필       │                          │                  │
│ 설정         │                          │                  │
└──────────────┴──────────────────────────┴──────────────────┘
```

- 기본 너비: 좌측 230px, 가운데 최대 640px, 우측 280px
- 화면이 좁아지면 좌측 메뉴는 아이콘 전용으로 축소됩니다.
- 더 좁아지면 우측 사용자 요약이 제거됩니다.

### 6.2 모바일

```text
┌──────────────────────────┐
│ rexondex       현재 화면  │  고정 상단 헤더
├──────────────────────────┤
│                          │
│        현재 화면          │
│                          │
├──────────────────────────┤
│ 일기  달력  프로필  설정   │  고정 하단 메뉴
└──────────────────────────┘
```

- `620px` 이하에서 모바일 구조로 전환합니다.
- 좌측 메뉴와 우측 패널을 숨깁니다.
- 하단에 네 개의 주요 메뉴를 고정합니다.
- 상단 우측 텍스트가 현재 화면 이름으로 변경됩니다.
- 안전 영역 `env(safe-area-inset-bottom)`을 반영합니다.

## 7. 화면별 동작

### 7.1 일기 피드

- 초기 화면입니다.
- 기록 ID를 역순으로 순회하여 최신 기록부터 표시합니다.
- 모든 기록은 하나의 연속된 스크롤 피드로 렌더링됩니다.
- 각 게시물은 프로필 이미지, 사용자명, 날짜, 참고 링크, 본문과 ID를 포함합니다.
- 프로필 이미지는 `rexondex.jpg`를 사용합니다.
- 달력에서 기록 날짜를 선택하면 피드로 전환한 뒤 해당 게시물까지 스크롤합니다.

### 7.2 달력

- 가장 최신 기록의 연·월을 초기값으로 사용합니다.
- 연도, 12개월, 이전·다음 달 버튼을 제공합니다.
- 달력은 월요일부터 시작하는 6주, 42칸 고정 그리드입니다.
- 기록이 없는 날짜는 작은 일반 날짜로 표시합니다.
- 기록이 있는 날짜는 날짜 숫자를 원으로 감쌉니다.
- 참고 링크가 있는 날짜는 이중 원과 `↗` 기호로 구분합니다.
- 날짜 원을 선택하면 대응하는 피드 게시물로 이동합니다.

### 7.3 프로필

- `rexondex.jpg` 프로필 이미지를 표시합니다.
- 작성한 날, 수록 연도, 최근 기록 ID를 보여줍니다.
- 다음 외부 프로필을 연결합니다.

| 서비스 | 주소 |
|---|---|
| Website | `https://rexondex.github.io` |
| Tistory | `https://rexondex.tistory.com` |
| Reddit | `https://www.reddit.com/user/rexondex` |
| YouTube | `https://www.youtube.com/@rexon-dex` |
| X | `https://x.com/rexon_dex` |

모든 외부 링크는 새 탭으로 열리고 `rel="noopener"`가 적용됩니다.

### 7.4 설정

- 밝은 화면과 어두운 화면을 선택합니다.
- 선택값은 `localStorage`의 `archive-theme` 키에 저장합니다.
- 다음 실행 때 `index.html`의 인라인 스크립트가 저장값을 먼저 적용하여 화면 깜빡임을 줄입니다.
- 테마 변경 시 `<meta name="theme-color">`도 함께 변경합니다.

## 8. 디자인 시스템

### 8.1 토큰

`tokens.css`는 화면에서 직접 사용하는 의미 기반 변수를 정의합니다.

```text
배경:       --bg, --surface, --surface-2
텍스트:     --text, --muted, --subtle
경계선:     --border, --border-strong
강조:       --accent, --accent-soft, --on-accent
기록:       --record, --record-on
접근성:     --focus, --overlay
효과:       --shadow
```

컴포넌트 CSS에는 가능한 한 실제 색상값 대신 토큰을 사용합니다. 새 테마는 같은 토큰 집합을 반드시 모두 구현해야 합니다.

### 8.2 테마

현재 테마:

- `light`: 흰색 중심의 밝은 화면
- `dark`: 검은색 중심의 어두운 화면

테마 ID는 다음 세 위치가 일치해야 합니다.

1. `theme-manager.js`의 `THEMES`
2. `tokens.css`의 `[data-theme="..."]`
3. `ThemeManager.apply()`의 브라우저 테마 색상 매핑

### 8.3 타이포그래피

외부 웹폰트에 의존하지 않습니다.

```css
font-family: Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
```

- 피드 본문 기본 크기: 16px
- 피드 본문 행간: 1.78
- 운영체제의 한글 글꼴을 우선 활용합니다.
- 기록 ID처럼 기계적인 값에만 제한적으로 고정폭 글꼴을 사용합니다.

### 8.4 접근성 원칙

- 아이콘 버튼에는 `aria-label`을 제공합니다.
- 현재 메뉴에만 `aria-current="page"`를 설정합니다.
- 모바일 화면 제목은 `aria-live="polite"`로 갱신합니다.
- 키보드 포커스는 3px 외곽선으로 표시합니다.
- 주요 버튼과 링크는 최소 44px 높이를 기준으로 합니다.
- 색상만으로 기록 상태를 전달하지 않고 원, 이중 원과 기호를 함께 사용합니다.
- `prefers-reduced-motion: reduce` 환경에서는 스크롤 애니메이션과 전환을 제거합니다.
- 프로필 이미지에는 대체 텍스트를 제공하고 반복되는 피드 이미지는 장식 이미지로 처리합니다.

## 9. 빌드 시스템

Node 패키지나 번들러 프레임워크 없이 PowerShell 스크립트만 사용합니다.

### 9.1 데이터 빌드

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-database.ps1
```

동작 순서:

1. 프로젝트 루트의 `database` 폴더를 찾습니다.
2. 파일만 조회합니다.
3. 정확한 숫자 6자리 이름만 남깁니다.
4. `yyyyMMdd`로 실제 날짜인지 검증합니다.
5. 이름순으로 정렬합니다.
6. 각 파일을 UTF-8 문자열로 읽습니다.
7. 압축 JSON 객체로 변환합니다.
8. `window.ARCHIVE_DATABASE = ...` 형식의 `database.js`를 생성합니다.
9. BOM 없는 UTF-8로 저장합니다.

### 9.2 앱 빌드

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-app.ps1
```

모듈 결합 순서:

1. `src/domain/diary.js`
2. `src/infrastructure/static-diary-repository.js`
3. `src/application/archive-store.js`
4. `src/presentation/theme-manager.js`
5. `src/presentation/archive-app.js`
6. `src/main.js`

스크립트는 `import` 줄과 `export` 키워드를 제거한 뒤 모든 파일을 IIFE와 strict mode 안에 결합합니다.

```js
(() => {
  'use strict';
  // 결합된 소스
})();
```

이 빌드는 의존성 그래프를 자동 분석하지 않습니다. 새 모듈을 추가하면 `build-app.ps1`의 `$sourceFiles` 배열에 의존 순서대로 직접 등록해야 합니다.

## 10. 작업 절차

### 10.1 새 일기 추가

1. 확장자 없는 파일을 만듭니다.

```text
database/260804
```

2. UTF-8로 내용을 작성합니다.
3. 데이터 번들을 갱신합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-database.ps1
```

4. `index.html`을 열거나 새로고침하여 확인합니다.
5. 원본 파일과 `database.js`를 함께 커밋합니다.

### 10.2 기존 일기 수정

1. `database/YYMMDD` 원본을 수정합니다.
2. `build-database.ps1`을 다시 실행합니다.
3. 원본과 갱신된 `database.js`를 함께 커밋합니다.

### 10.3 화면 또는 기능 수정

1. `src` 내부 원본 파일을 수정합니다.
2. 앱 번들을 갱신합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-app.ps1
```

3. `index.html`을 새로고침하여 확인합니다.
4. `src` 변경과 `app.js`를 함께 커밋합니다.

### 10.4 스타일 수정

`tokens.css`와 `app.css`는 `index.html`에서 직접 참조하므로 별도 앱 빌드 없이 새로고침하면 반영됩니다. JavaScript 마크업도 함께 수정했다면 `app.js`를 다시 생성해야 합니다.

### 10.5 프로필 이미지 교체

같은 파일명을 유지하려면 `rexondex.jpg`를 새 이미지로 덮어씁니다. 브라우저 캐시가 남으면 강력 새로고침을 사용합니다.

다른 파일명을 사용하려면 `archive-app.js`의 `profileImage`와 피드 이미지 경로를 모두 변경하고 `app.js`를 다시 생성합니다.

### 10.6 사이트 아이콘 교체

`favicon.svg`를 수정합니다. `index.html`의 `<link rel="icon">`이 이 파일을 직접 참조합니다. 별도의 Apple touch icon이 필요하면 전용 PNG 에셋과 `<link rel="apple-touch-icon">`을 추가해야 합니다.

## 11. 로컬 실행

### 가장 간단한 방법

`index.html`을 직접 엽니다.

```text
file:///.../rexondex.github.io/index.html
```

기록과 앱이 일반 JavaScript 파일에 정적으로 포함되어 있으므로 별도 서버가 필요하지 않습니다.

### 정적 서버로 확인

GitHub Pages와 유사한 HTTP 환경이 필요하면 선택적으로 정적 서버를 사용할 수 있습니다.

```powershell
python -m http.server 8000
```

```text
http://localhost:8000
```

## 12. 배포

저장소 이름이 `rexondex.github.io`이고 `main` 브랜치를 GitHub Pages 소스로 사용합니다.

```powershell
git add .
git commit -m "Update diary"
git push origin main
```

배포 주소:

```text
https://rexondex.github.io
```

반영에는 잠시 시간이 걸릴 수 있으며 GitHub 저장소의 Actions 또는 Pages 배포 상태에서 확인할 수 있습니다.

배포 전에 반드시 확인할 생성물:

- 일기를 수정했다면 `database.js`
- 앱 소스를 수정했다면 `app.js`
- 프로필 이미지나 파비콘을 수정했다면 해당 에셋

## 13. 검증 체크리스트

### 데이터

- [ ] 새 파일명이 숫자 6자리인가?
- [ ] 실제 존재하는 날짜인가?
- [ ] 확장자가 없는가?
- [ ] UTF-8로 저장했는가?
- [ ] `database.js`를 다시 생성했는가?
- [ ] 생성된 기록 수가 원본 파일 수와 같은가?

### 애플리케이션

- [ ] `src` 변경 후 `app.js`를 다시 생성했는가?
- [ ] `node --check app.js`가 통과하는가?
- [ ] `node --check database.js`가 통과하는가?
- [ ] `git diff --check`가 통과하는가?
- [ ] 일기, 달력, 프로필, 설정 메뉴가 모두 열리는가?
- [ ] 달력 날짜가 대응하는 피드 기록으로 이동하는가?
- [ ] 밝은 화면과 어두운 화면이 모두 읽기 쉬운가?
- [ ] 모바일 하단 메뉴가 본문을 가리지 않는가?

### 에셋과 링크

- [ ] `rexondex.jpg`가 피드, 프로필과 우측 패널에 표시되는가?
- [ ] `favicon.svg`가 유효한 SVG인가?
- [ ] 모든 SNS 링크가 올바른 주소로 열리는가?

## 14. 확장 지점

### 새 테마 추가

1. `theme-manager.js`의 `THEMES`에 ID와 표시명을 추가합니다.
2. `tokens.css`에 동일한 `data-theme` 선택자를 추가합니다.
3. `ThemeManager.apply()`의 테마 색상 매핑을 추가합니다.
4. `app.js`를 다시 생성합니다.

### 새 화면 추가

1. `navItems()`에 화면 ID, 이름과 아이콘을 추가합니다.
2. `shell()`에 `${id}View` 섹션을 추가합니다.
3. `showView()`의 화면 목록과 모바일 제목 매핑에 추가합니다.
4. 필요한 렌더 및 이벤트 메서드를 구현합니다.
5. 반응형 CSS를 추가합니다.
6. `app.js`를 다시 생성합니다.

### 새 SNS 링크 추가

`archive-app.js`의 `socialLinks()`에 링크 행을 추가하고 `app.js`를 다시 생성합니다. 같은 함수가 프로필 전체 목록과 우측 축약 목록을 모두 만듭니다.

### 저장소 구현 교체

새 저장소는 최소한 다음 비동기 인터페이스를 제공해야 합니다.

```js
get(id)                 // { id, markdown, reference }
findReferenceIds(ids)   // Set<string>
```

그다음 `main.js`에서 `StaticDiaryRepository` 대신 새 구현체를 주입합니다. 화면 계층은 변경하지 않아도 됩니다.

### 검색 기능 추가

권장 위치:

- 원문 검색과 인덱싱: infrastructure
- 검색어와 필터 상태: application
- 검색 입력과 결과: presentation

원본 데이터 규칙은 domain에 유지합니다.

## 15. 제약과 주의사항

- `database.js`는 원본 데이터의 복사본이므로 원본 수정 후 반드시 다시 생성해야 합니다.
- 기록 수가 매우 많아지면 모든 본문이 하나의 JavaScript 파일과 피드 DOM에 포함되어 초기 로딩 비용이 커집니다.
- 현재 피드는 모든 기록을 한 번에 렌더링합니다. 수백 또는 수천 건으로 늘어나면 페이지네이션이나 가상 스크롤을 고려해야 합니다.
- `marked`는 CDN으로 불러옵니다. 오프라인에서는 기본 텍스트 렌더러가 대신 사용되므로 고급 Markdown 표현이 제한됩니다.
- 일기 내용은 소유자가 관리하는 신뢰된 데이터라는 전제로 Markdown HTML을 표시합니다. 외부 사용자가 내용을 입력할 수 있게 확장한다면 HTML 정화 계층이 필요합니다.
- 파일명 연도는 현재 `20YY`로 해석합니다. 2100년대 등 다른 세기가 필요하면 도메인과 빌드 스크립트 양쪽을 수정해야 합니다.
- PowerShell 앱 빌드는 단순 결합 방식이므로 같은 스코프의 중복 식별자나 잘못된 파일 순서에 주의해야 합니다.
- 생성된 `app.js`와 `database.js`도 GitHub Pages 배포에 필요하므로 커밋 대상입니다.

## 16. 핵심 원칙 요약

```text
기록은 database에서 작성한다.
데이터 변경 후 database.js를 만든다.
기능은 src에서 수정한다.
기능 변경 후 app.js를 만든다.
브라우저는 생성물만 실행한다.
계층은 안쪽 규칙에서 바깥 화면 방향으로 의존한다.
```

# REXONDEX Diary

HTML, CSS, JavaScript만 사용하는 정적 개인 일기장입니다.

별도 프레임워크, 패키지 설치, 빌드 명령, 서버 코드와 사용자 정의 GitHub Actions가 없습니다. `main` 브랜치의 루트 디렉터리를 GitHub Pages로 게시하면 바로 동작합니다.

## 파일 구조

```text
rexondex.github.io/
├─ index.html                         페이지 진입점
├─ app.js                             전체 화면과 일기 로직
├─ database.js                        표시할 일기 파일명 목록
├─ database/                          확장자 없는 원본 일기
│  ├─ 260606
│  ├─ 260607
│  └─ ...
├─ theme.css                          밝은·어두운 테마 색상
├─ style.css                          전체 UI 스타일
├─ rexondex.jpg                       프로필 이미지
├─ favicon.svg                        사이트 아이콘
└─ README.md
```

## 새 일기 추가

### 1. 원본 파일 작성

`database` 폴더에 `YYMMDD` 형식의 확장자 없는 파일을 만듭니다.

```text
database/260807
```

파일명은 정확히 숫자 6자리이며 실제 존재하는 날짜여야 합니다.

```text
26 = 2026년
08 = 8월
07 = 7일
```

파일 안에는 일반 텍스트나 Markdown을 작성합니다.

```text
오늘 작성한 일기 내용
```

### 2. 목록 등록

`database.js`에 같은 파일명을 추가합니다.

```js
window.DIARY_FILES = [
  '260802',
  '260806',
  '260807',
];
```

마지막 항목 뒤의 쉼표는 있어도 됩니다.

### 3. GitHub에 게시

```powershell
git add database/260807 database.js
git commit -m "260807 일기 추가"
git push origin main
```

## 참고 링크

일기 첫 줄 전체에 링크를 작성하면 피드에서 참고 링크 카드로 분리됩니다.

```md
[https://example.com]

이 줄부터 일기 본문입니다.
```

표시 이름을 지정할 수도 있습니다.

```md
[관련 자료](https://example.com)
```

## 로컬에서 확인

일기 파일을 `fetch`로 읽으므로 `index.html`을 더블클릭하지 않고 간단한 정적 서버를 사용합니다.

```powershell
python -m http.server 8000
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:8000
```

## GitHub Pages 설정

저장소에서 한 번만 설정합니다.

1. `Settings` → `Pages`
2. `Source`: `Deploy from a branch`
3. `Branch`: `main`
4. 폴더: `/(root)`
5. `Save`

이후에는 `main`에 푸시할 때마다 자동으로 게시됩니다. Actions 화면에 GitHub가 내부적으로 실행하는 `pages build and deployment`가 나타날 수 있지만, 이 저장소가 직접 관리하는 Actions 워크플로는 아닙니다.

## 코드 수정 위치

| 변경할 내용 | 파일 |
|---|---|
| 화면 구조, 피드, 달력, 프로필, 설정 동작 | `app.js` |
| 표시할 일기 날짜 | `database.js` |
| 일기 내용 | `database/YYMMDD` |
| 색상과 테마 | `theme.css` |
| 크기, 간격, 반응형 디자인 | `style.css` |
| 프로필 이미지 | `rexondex.jpg` |
| 브라우저 아이콘 | `favicon.svg` |

## 실행 흐름

```text
index.html
  ├─ database.js에서 날짜 목록 확인
  ├─ app.js 실행
  ├─ database/YYMMDD 본문 요청
  └─ 일기 피드와 달력 렌더링
```

`app.js` 내부에서는 날짜 검증, 기록 저장소, 달력 상태, 테마와 화면 클래스를 구분해 관리하지만 별도 파일이나 빌드 과정은 사용하지 않습니다.

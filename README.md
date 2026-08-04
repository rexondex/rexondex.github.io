# REXONDEX Personal Archive

날짜별 Markdown 기록을 달력에서 탐색하는 개인 디지털 아카이브입니다.

## 기록 추가

1. `database/yymmdd` 형식으로 확장자 없는 파일을 만듭니다. 예: `database/260804`
2. 아래 명령으로 브라우저용 `database.js`를 갱신합니다.
3. 커밋하고 배포합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-database.ps1
```

파일명은 정확히 숫자 6자리여야 하며 `YY`, `MM`, `DD`로 나누어 실제 존재하는 날짜인지 검증합니다. 예를 들어 `260804`는 2026년 8월 4일로 처리되고, `261332`처럼 존재하지 않는 날짜는 달력에서 제외됩니다.

확장자는 붙이지 않습니다. 생성 스크립트가 유효한 6자리 날짜 파일만 읽어 `database.js`에 정적으로 포함합니다. 웹페이지 실행 중에는 `fetch`나 별도 기록 파일 로드가 발생하지 않습니다.

`database.js`를 직접 관리하려면 아래와 같은 객체 형식으로 기록을 명시해도 됩니다.

```js
window.ARCHIVE_DATABASE = {
  "260804": "2026년 8월 4일의 기록",
  "260805": "여러 줄은\\n줄바꿈 문자로 작성"
};
```

첫 줄에 URL을 대괄호로 감싸면 기록 상단의 참고 링크로 표시됩니다.

```md
[https://example.com]
```

## 아키텍처

원본 데이터인 `database/*`와 브라우저용 정적 번들인 `database.js`는 프레젠테이션 코드와 독립적으로 유지됩니다.

```text
src/
├─ domain/          날짜, 기록 ID, Markdown 메타데이터 규칙
├─ infrastructure/  정적 데이터 접근과 캐시
├─ application/     달력·선택 상태와 화면 유스케이스
└─ presentation/    UI 렌더링, 스타일 토큰, 테마
```

새 데이터 소스나 검색 인덱스를 붙일 때는 `infrastructure`의 저장소 구현을 교체하고, 화면 테마를 추가할 때는 `tokens.css`와 `theme-manager.js`에 같은 테마 ID를 등록합니다.

## 로컬 실행

별도 서버 없이 `index.html`을 직접 열 수 있습니다. GitHub Pages에서도 같은 정적 데이터가 사용됩니다. 원본 기록을 수정하거나 추가할 때마다 `tools/build-database.ps1`을 다시 실행해야 변경 내용이 반영됩니다.

애플리케이션 소스 자체를 수정한 경우에는 브라우저용 `app.js`도 갱신합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-app.ps1
```

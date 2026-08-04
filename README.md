# REXONDEX Personal Archive

날짜별 Markdown 기록을 달력에서 탐색하는 개인 디지털 아카이브입니다.

## 기록 추가

1. `daily/yymmdd` 형식으로 확장자 없는 파일을 만듭니다. 예: `daily/260804`
2. `daily.js`의 `DIARY_FILES` 배열에 확장자를 뺀 파일명을 추가합니다.
3. 커밋하고 배포합니다.

파일명은 정확히 숫자 6자리여야 하며 `YY`, `MM`, `DD`로 나누어 실제 존재하는 날짜인지 검증합니다. 예를 들어 `260804`는 2026년 8월 4일로 처리되고, `261332`처럼 존재하지 않는 날짜는 달력에서 제외됩니다.

기존 `daily/yymmdd.md` 파일도 계속 읽을 수 있습니다. 같은 날짜의 확장자 없는 파일과 `.md` 파일이 모두 있으면 확장자 없는 파일을 우선합니다.

첫 줄에 URL을 대괄호로 감싸면 기록 상단의 참고 링크로 표시됩니다.

```md
[https://example.com]
```

## 아키텍처

기존 데이터 계층인 `daily.js`와 `daily/*`는 프레젠테이션 코드와 독립적으로 유지됩니다.

```text
src/
├─ domain/          날짜, 기록 ID, Markdown 메타데이터 규칙
├─ infrastructure/  Markdown 파일 로드와 캐시
├─ application/     달력·선택 상태와 화면 유스케이스
└─ presentation/    UI 렌더링, 스타일 토큰, 테마
```

새 데이터 소스나 검색 인덱스를 붙일 때는 `infrastructure`의 저장소 구현을 교체하고, 화면 테마를 추가할 때는 `tokens.css`와 `theme-manager.js`에 같은 테마 ID를 등록합니다.

## 로컬 실행

ES 모듈과 `fetch`를 사용하므로 파일을 직접 열지 말고 정적 서버로 실행합니다.

```sh
npx serve .
```

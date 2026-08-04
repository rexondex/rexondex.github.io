# REXONDEX Personal Archive

날짜별 Markdown 기록을 달력에서 탐색하는 개인 디지털 아카이브입니다.

## 기록 추가

1. `daily/yymmdd.md` 형식으로 파일을 만듭니다. 예: `daily/260804.md`
2. `daily.js`의 `DIARY_FILES` 배열에 확장자를 뺀 파일명을 추가합니다.
3. 커밋하고 배포합니다.

첫 줄에 URL을 대괄호로 감싸면 기록 상단의 참고 링크로 표시됩니다.

```md
[https://example.com]
```

## 아키텍처

기존 데이터 계층인 `daily.js`와 `daily/*.md`는 프레젠테이션 코드와 독립적으로 유지됩니다.

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

# rexondex 일기장

https://rexondex.github.io

달력에서 기록이 있는 날짜를 골라 읽는 정적 일기장입니다.

## 새 일기 추가

1. `daily` 폴더에 `yymmdd.md` 형식의 파일을 만듭니다. 예: `260628.md`
2. `daily.js`의 `DIARY_FILES` 배열에 확장자를 뺀 파일명을 추가합니다.
3. 커밋하고 푸시합니다.

마크다운 첫 줄에 URL을 대괄호로 감싸 작성하면 일기 상단의 참고 링크로 표시됩니다.
이 기록은 달력에서도 이중 원과 링크 마크로 자동 강조됩니다.

```md
[https://example.com]
```

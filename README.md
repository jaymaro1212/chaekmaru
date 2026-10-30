# 책마루 — 내 저장소 연동 책 리더

- `index.html` : **서재(책 뷰어)** — 저장소의 책을 한 쪽 / 두 쪽(펼침)으로 책장 넘기며 읽기
- `upload.html` : **책 담기** — 저작권이 끝난 무료 책 검색해서 담기 + 내 파일(TXT·EPUB·PDF·CBZ) 올리기

## 처음 한 번 설정 (약 10분)

### 1. 책 보관용 저장소 만들기 (비공개)
1. github.com → 오른쪽 위 **+** → **New repository**
2. 이름: `my-books` / **Private** 선택 → Create repository

> 꼭 **비공개**로 만들어 주세요. 공개 저장소에 산 책을 올리면 누구나 받을 수 있어 저작권 문제가 생겨요.

### 2. 사이트 올리기 (공개 저장소 + GitHub Pages)
1. 저장소를 하나 더 만들어요. 이름: `chaekmaru`, **Public** (사이트 코드만 들어가고 책은 들어가지 않아요)
2. **Add file → Upload files**로 이 폴더의 파일을 모두 올리기 (`.nojekyll` 포함)
3. **Settings → Pages → Branch: main / (root) → Save**
4. 1~2분 뒤 `https://<내아이디>.github.io/chaekmaru/` 주소로 열려요

### 3. 토큰 만들기
1. GitHub → 프로필 사진 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. Expiration: 원하는 기간 (최대 1년)
3. Repository access: **Only select repositories** → `my-books`만 선택
4. Permissions → Repository permissions → **Contents: Read and write**
5. 만들어진 `github_pat_...` 복사

### 4. 갤럭시탭에서
1. 삼성 인터넷이나 크롬에서 `https://<내아이디>.github.io/chaekmaru/` 열기
2. 아이디 / `my-books` / 토큰 입력 → 연결하기
3. 메뉴 → **홈 화면에 추가**를 누르면 앱처럼 전체 화면으로 열려요

PC에서 책을 올릴 때도 같은 주소의 **책 담기** 탭에서 같은 방법으로 연결하면 돼요.

## 저장소 안의 구조
```
library.json      책 목록 (제목, 작가, 형식, 파일 위치)
progress.json     읽던 위치 (기기끼리 이어 읽기)
books/            책 파일
covers/           표지 미리보기
```

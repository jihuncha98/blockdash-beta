# BLOCKDASH v1.0 통합 베타

Krunker.io의 빠른 이동감을 참고한 **독립적인 3D 홀로그램 TAG 아레나 게임**. 기존 BLOCKDASH v0.3의 입력 방식을 토대로 로비, AI, 맵, 파쿠르, 네트워크 서버를 재설계했습니다. 캐릭터·맵·장비는 모두 독자적인 간단한 블록형 스타일입니다.

> **배포 전 확인:** 통합 베타입니다. JavaScript 구문 검사와 Node.js 자동 테스트는 통과했지만, 이 작업 환경에서 실제 브라우저/WebGL와 iPad Safari 실기기 테스트는 실행할 수 없었습니다. 중요한 개인 데이터나 기존 GitHub 버전을 보존하려면 **백업 브랜치**를 먼저 만드세요.

## 1. 현재 구현 범위

- 싱글: 연습장(90초 점수), AI 대전(쉬움·보통·어려움, AI 1~5), 파쿠르(9개 체크포인트)
- 온라인: 개인전·팀전, 최대 8명까지 방 참가, 비공개 코드, 공개방 검색, 서버 중심 이동/태그/점수/재등장 판정, 재접속용 세션 20초 보관
- 게임: 로우폴리 맵 2개, 장비 3개(SPARK/PRISM/PULSE), 점프·슬라이드·시점 기준 WASD, 카메라 설정, 효과음, HUD 및 순위판
- PC와 아이패드 입력: 키보드/마우스 또는 터치패드, 모바일 멀티터치(스틱+TAG+시점 회전)
- 기록: 이 브라우저의 로컬 기록만 보관(게스트)

**완료되지 않은 항목:** Supabase 실제 회원가입/로그인 및 기기 간 랭킹 저장, 실제 외부 서버 호스팅, 인터넷 환경의 8인 동시접속 스트레스 테스트, iPad 실기기 테스트, 운영 수준의 보안 검토. 현재 온라인 대전 결과는 서버를 재시작하면 별도로 남지 않습니다. 회원제는 다른 프로젝트의 데이터베이스를 재사용하지 말고 독립된 프로젝트를 마련하는 것을 권장합니다.

## 2. 폴더 구조

```text
BLOCKDASH_v1_integrated/
├── index.html                 # 웹 시작 페이지
├── src/
│   ├── app.js                 # 로비·게임 진행·HUD·점수
│   ├── ai.js                  # 봇 경로 탐색과 행동
│   ├── controls.js            # PC·아이패드 입력
│   ├── network.js             # 서버 연결
│   ├── style.css              # UI 디자인
│   └── world.js               # 3D 렌더링·맵·캐릭터
├── shared/rules.js            # 이동·충돌·맵·장비 공통 규칙
├── server/ws.js               # 최소 WebSocket 프로토콜
├── server/index.js            # 게임 서버
├── tests/                     # 자동 테스트
├── .github/workflows/deploy.yml
└── package.json
```

브라우저용 코드는 `index.html`, `src/`, `shared/` 3개 경로가 **같은 최상위 폴더**에 있어야 합니다. Three.js는 기존에 사용해 성공한 CDN 0.180.0 버전으로 불러옵니다. 인터넷 연결이 필요합니다.

## 3. 조작

| 동작 | PC | 아이패드 |
|---|---|---|
| 이동 | W A S D | 왼쪽 스틱 |
| 시점 | 마우스 또는 터치패드 | 오른쪽 드래그 |
| 달리기 | Shift | 스틱 바깥쪽 |
| 점프 | Space | 점프 버튼 |
| 슬라이드 | C | 슬라이드 버튼 |
| TAG | 마우스 왼쪽 누르기 | TAG 누른 채 드래그 가능 |
| 장비 변경 | 1, 2, 3 또는 Q | 장비 버튼 |
| 순위표 | Tab | 상단 순위 버튼 |
| 일시정지 | Esc | 우측 상단 II |

PC 노트북 터치패드 사용 시 Windows 설정 → Bluetooth 및 장치 → 터치패드 → **탭 → 터치패드 민감도 가장 높음**을 확인합니다. 이것은 Windows 기기 설정이며 브라우저 코드만으로 강제로 바꿀 수 없습니다.

## 4. GitHub Pages 배포 (기존 주소 유지)

1. 현재 저장소 `https://github.com/jihuncha98/blockdash-fps`에서 **백업 브랜치**를 만든 뒤 변경을 시작합니다. 원본 v0.3 ZIP도 따로 보관하면 좋습니다.
2. 저장소 `main` 최상위에 이 프로젝트의 `index.html`, `src` 폴더 전체, `shared` 폴더 전체, `.github/workflows/deploy.yml`, `package.json`, `tests` 등을 **원래 폴더 구조대로** 올립니다. 이전의 `src/game.js`는 더 이상 시작 파일에서 참조하지 않아도 무방합니다.
3. GitHub에서 Settings → Pages → Build and deployment → **GitHub Actions**로 설정합니다.
4. Actions의 `BLOCKDASH static deploy` 워크플로가 테스트를 먼저 수행하고, 성공하면 정적 웹파일을 배포합니다.
5. `https://jihuncha98.github.io/blockdash-fps/` 에서 접속하고 강력 새로고침을 합니다. 이는 *배포 후* 테스트할 예정 주소로, 이 파일 전달 시점에는 새 코드가 그 주소에 반영되지 않았습니다.

**중요:** GitHub 사이트에서 ZIP을 그대로 업로드하면 게임 프로젝트가 자동으로 압축 해제되지 않습니다. 압축을 풀고 **폴더 안의 항목을 폴더 구조 그대로** 업로드하거나 GitHub Desktop 등 Git 작업 도구를 사용하세요.

## 5. PC 로컬 실행

아래 명령어는 프로젝트의 최상위 폴더에서 실행합니다.

```sh
python -m http.server 8000
```

접속: `http://localhost:8000` . 로컬 파이썬이 설치되지 않았다면 GitHub Pages 배포로 실행합니다.

## 6. 멀티플레이 서버 실행

**게임 서버는 GitHub Pages에서 실행되지 않습니다.** PC나 별도의 Node.js 20+ 서버가 필요합니다. 추가 npm 패키지를 설치할 필요는 없습니다.

```sh
node server/index.js
```

- 기본 서버 WebSocket 주소: `ws://localhost:3001/ws`
- 서버 상태 확인: `http://localhost:3001/health`
- 공개방 목록: `http://localhost:3001/rooms`

웹 페이지를 `http://localhost:8000` 에서 열어 테스트하는 경우, 로비 서버 주소에 `ws://localhost:3001/ws`를 입력합니다. 다른 PC에서는 서버 컴퓨터 IP/도메인 사용 및 네트워크 방화벽 설정이 필요할 수 있습니다.

GitHub Pages는 HTTPS이므로 배포된 게임에서 온라인 대전을 하려면 **TLS가 적용된 `wss://` 서버**가 필요합니다. Node 앱 실행과 WebSocket 프록시를 지원하는 호스팅 서비스를 따로 배포하고, 그 서비스에서 발급한 `wss://.../ws` 주소를 로비에 입력해야 합니다. 무료 서버의 절전·사용량 제한은 미리 확인하세요.

외부 배포 시 다음 환경변수를 사용하는 것을 권장합니다.

```text
PORT=3001
ALLOWED_ORIGINS=https://jihuncha98.github.io
```

`ALLOWED_ORIGINS`를 설정하면 그 출처에서만 웹소켓 연결을 수락합니다. 단, Origin 제한만으로 인증이 되는 것은 아닙니다. 현재는 친구끼리 시험하는 **게스트 베타 서버**이며 운영 서비스의 보안 또는 악용 방지 체계가 완성된 것은 아닙니다.

온라인 모드에서는 첫 플레이어가 비공개방을 생성하면 화면에 표시된 코드를 친구에게 전달합니다. 두 번째 플레이어가 같은 서버 주소와 방 코드를 입력하면 경기가 시작됩니다. 공개방 옵션은 동일 모드/맵의 참가 가능한 공개방을 검색하고 없으면 새 방을 생성합니다.

## 7. 테스트 방법

Node.js 20+ 환경에서:

```sh
npm test
npm run check
```

`npm test`는 이동 방향, 장애물 충돌, 점프, 지형 시작 지점, 2인 서버 접속, 방 생성과 위치 동기화 등을 검사합니다. 브라우저 렌더링·물리 감각·아이패드 멀티터치의 실제 기기 동작은 별도 테스트 대상입니다.

## 8. 수정할 부분 안내

- 맵 모양/장애물/플레이어 시작 위치: `shared/rules.js`의 `MAPS`
- 장비 쿨다운·태그 효과·에너지: `shared/rules.js`의 `TOOLS`
- 이동 속도·점프·슬라이드: `shared/rules.js` 상단 상수 및 `stepPlayer`
- AI 난이도/경로: `shared/rules.js`의 `BOT_LEVELS`, `src/ai.js`
- 모바일 조이스틱/TAG 동시 입력: `src/controls.js`
- 로비 및 점수표 디자인: `src/style.css`, `index.html`
- 서버 인원·라운드 규칙: `server/index.js`

문제가 발생하면 한 파일만 교체하기보다 변경한 부분의 테스트를 돌린 뒤 통합 프로젝트 전체를 배포하는 것이 좋습니다.

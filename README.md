# ISOMETRIC AUTO GAME STUDIO — 3Q

Ứng dụng desktop-local điều khiển game Android trên BlueStacks theo tài liệu `MASTER_SPEC.md`.

## Cấu trúc dự án
- `backend/`: FastAPI + OpenCV + Pydantic + SQLite + WebSocket streaming.
- `frontend/`: React + TypeScript + Vite + Tailwind/Modern UI.
- `data/`: Lưu trữ template ảnh, recording và camera profiles.
- `run.bat`: Click đúp 1 chạm để tự động kết nối BlueStacks, mở Backend, Frontend và Trình duyệt Studio.

## Tiến độ hoàn thành (Phase 0 & Phase 1)
- [x] **Phase 0 (Bootstrap)**: Khởi tạo kiến trúc backend FastAPI, frontend Vite React TS, môi trường venv python 3.13, health check `/api/health`.
- [x] **Phase 1 (ADB & Live Preview & Input Dispatcher)**:
  - Tự động nhận diện thiết bị BlueStacks qua ADB (`adb devices -l`).
  - Hàng đợi Input Single Queue có execution lock tránh trùng lệnh.
  - Streaming khung hình trực tiếp qua WebSocket `ws://127.0.0.1:8000/ws/devices/{serial}/frames` với adaptive FPS.
  - Tự động giữ nguyên tỷ lệ khung hình chuẩn (Letterbox Aspect-Ratio Preservation).
  - Ánh xạ tọa độ chuột chính xác từ HTML sang device pixel thực tế (720x1280).
  - Tương tác click gửi Tap, kéo chuột gửi Swipe trực tiếp vào game.
  - Unit tests đầy đủ với FakeADB (`pytest backend/tests/unit/test_phase1.py` pass 100%).

## Dong goi installer Windows x64 (khong can Python/Node tren may dich)
- May build can Python >=3.11, Node.js/npm va internet. Cai backend: `& '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt`; cai cong cu build: `& '.\.venv\Scripts\python.exe' -m pip install pyinstaller`.
- Cai Inno Setup 7 tren may build; chay `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\package-portable.ps1`. Script build frontend, dong goi backend/Python bang PyInstaller, kem adb va 2 DLL can thiet, tao installer `release\Auto3QStudio-Setup-win-x64.exe`. Build lai duoc ghi de EXE installer cu; khong ghi de runtime data cua ban cai tren may dich.
- Chuyen `release\Auto3QStudio-Setup-win-x64.exe` sang Windows x64 khac va chay installer, mo Auto 3Q Studio tu Start Menu/Desktop. Cai lai cung AppId se cap nhat file chuong trinh, giu data cu. Khong can `.venv` hoac `frontend\node_modules` tren may dich. Trinh duyet mo `http://127.0.0.1:5173/`; backend o 8000. Khong can Python/Node/internet tren may dich de mo Studio. May dich can BlueStacks, ADB da bat va Windows cho phep chay exe chua ky so; can cau hinh game theo moi may.
- Ban installer duoc seed `auto_config.json`, `scenarios.json` va anh `templates` tu `data\` cua may build; file da ton tai trong thu muc cai dat se KHONG bi ghi de khi update. Khong chia se installer nay neu du lieu game la ca nhan. File ZIP portable cu da tao truoc do khong tu dong nhap du lieu goc; nen dung installer moi. `platform-tools` kem adb va NOTICE. Kiem tra tren may sach: cai installer, mo shortcut, xem FE va `GET http://127.0.0.1:8000/api/health`, ket noi BlueStacks roi thu preview. Chua chung minh tuong thich voi moi phien ban Windows/BlueStacks.

## Cách chạy thủ công
1. **Backend**:
   ```powershell
   .\.venv\Scripts\python.exe main.py
   ```
2. **Frontend**:
   ```powershell
   cd frontend
   npx pnpm run dev
   ```
3. Mở trình duyệt tại `http://127.0.0.1:5173`.

## Lịch chạy kịch bản
- Kịch bản BẬT với thời gian 0 phút được thử chạy một lần trong mỗi lần bật auto; tắt rồi bật auto tạo phiên mới. Kịch bản TẮT không tự chạy. Nếu bật kịch bản giữa phiên, nó sẽ được chạy một lần trong phiên đó.
- Thời gian lớn hơn 0 chạy theo chu kỳ. Số vòng lặp bên trong kịch bản vẫn được áp dụng; đặt 1 nếu muốn toàn bộ quy trình chỉ thực hiện một vòng. Một lần chạy thất bại không tự thử lại trong cùng phiên auto.

### Swipe kịch bản (backend)
`POST /api/scenarios/step/test` nhận `{"serial":"<ADB_SERIAL>","step":{"type":"swipe","swipe_directions":[{"direction":"up","count":2},{"direction":"right","count":1}],"swipe_distance_ratio":0.12,"duration_ms":400}}`. API lưu kịch bản `POST /api/scenarios` dùng cùng schema cho từng step. Các hướng thực hiện theo thứ tự mảng, mỗi lần kéo cùng độ dài pixel bằng tỉ lệ (0, 0.25] của cạnh ngắn ảnh gốc ADB; tối đa 4 hướng khác nhau, mỗi count 1–100, tổng tối đa 100, thời gian 50–5000 ms. Chụp màn hình thật một lần trước chuỗi; không kéo tiếp sau stop hoặc ADB báo lỗi. Nếu `swipe_directions` bỏ trống, vẫn dùng `swipe_from`/`swipe_to` như trước. Không xác nhận chuyển động bản đồ chỉ từ ADB success; thử trực tiếp trên BlueStacks khi có thiết bị.

## Quy chế code
1. Những hàm dùng chung khai báo chung 1 file để dùng lại ở các file khác
2. Mỗi task auto là 1 file riêng để dể quản lý và update sau này.
## Chay thu tu card bat dau den card dich
- Bam co 🚩 tren card dich: giao dien luu thay doi ngam (khong hien toast "Da luu"), mo tien trinh ngay, sau do goi `POST /api/scenarios/{scenario_id}/run-until` voi `{"serial":"<ADB_SERIAL>","stop_step_id":"<STEP_ID>"}`. Neu backend tu choi (vi du auto dang chay), tien trinh hien HTTP/status loi thay vi im lang. Chi thuc hien cac card tren nhanh duoc chon theo ket qua thuc te; neu nhanh khong den card dich thi khong tu chay nhanh khac.

## Sap xep so do macro
- Chon kieu xep roi bam Sap Xep: Gon ngang dung 1-4 cot tuy chieu rong viewport, chuoi thuong uu tien sang phai, nhanh Co/Khong xuong hang; Theo doi doc dua chuoi thuong xuong duoi; voi hai nhanh rieng biet va chua duoc xep, card CÓ nam ben trai, card cha If/Else o giua, card KHÔNG ben phai tren cung mot hang. Card duoc nhieu nhanh dung chung khong the nam canh moi card cha; khi do layout giu card rieng va duong noi. Day quay lai trong vong lap co the tro ve card phia tren. Tu thu zoom de vua graph; dung +/- de doc chi tiet, luu kich ban khi muon giu vi tri moi.
- Nhan tren card: VÀO mau vang la input (dich cua day noi); RA mau xanh la output (keo day tu day); nhanh RA: CÓ mau xanh la, RA: KHÔNG mau do la hai output theo ket qua. Mui ten tren day chi ve phia card nhan.
- Card tao vong lap uu tien ben phai. Nhan Co/Khong doi ben theo vi tri dich. Moi day co cong vao rieng, ke ca nhieu nhanh vao Finish; cong va doan dau/cuoi duoc giu cho truoc khi tim duong. Cam trung doan thang co do dai duong (ke ca stub), khong chi cong them chi phi. Start duoc ghim hang tren; Finish nam cac hang duoi.
- Keo card thu cong se tinh lai duong noi, khong doi graph thuc thi. Giao diem ngang/doc dung cau vuot nho (khong phai nut noi); graph bat ky khong duoc dam bao phang. Card de len nhau/bit cong se co canh bao, khong am tham mat day; moi ket noi van co nut xoa. Ket noi tham chieu ID da xoa duoc thong bao rieng, khong tu xoa du lieu cu.
- Test hoi quy (Node.js >=22.18): `cd frontend; npm test; npm run build; npm run lint`. Kiem tra thu cong khong bam game: mo kich ban, Tu Dong Xep Luoi, xem moi nhanh vao Finish co mui ten/cong rieng; kiem tra nhanh quay lai, keo card, xoa/noi lai mot day tren ban sao. Bam LUU KICH BAN chi khi muon luu thay doi.
- Routing chi thay doi hien thi, khong doi API/payload connections (`from_id`, `to_id`, `branch`) hay backend execution.
- Ca hai kieu xep deu dat card bat dau o hang tren cung (neu kich ban da chon diem bat dau), ke ca khi card do co day noi di vao. Sap xep khong doi thu tu thuc thi hay nhanh ket noi, khong tu luu; bam LUU KICH BAN de giu bo cuc sau reload.

## Chon toa do macro tren anh
- Trong action Bam toa do, bam `Chon tren anh chup (khong bam game)`, chon diem tren anh, sau do `Luu toa do`. Anh chup dung kich thuoc device goc; diem duoc quy doi tu kich thuoc hien thi sang pixel device.
- Chon diem va Luu toa do chi sua macro tren giao dien, khong gui input vao game. Bam LUU KICH BAN de luu lau dai; nut Thu la thao tac rieng co gui lenh that.
- Can camera ve trung tam va dong popup truoc khi lay diem/chay buoc. Bo chon nay khong tu can camera, khong tu xac minh cong trinh va khong tu them nhanh xu ly loi; noi buoc kiem tra anh bang cong trinh sau tap trong macro.
- API `GET /api/devices/{serial}/frame` tra JPEG khong resize; `X-Width`, `X-Height` la kich thuoc device. Stream van giu cach scale hien co.

## Khoi dong khong mo cua so dich vu
- Chay `run.bat`: backend va frontend preview chay an, khong mo hai cua so CMD/PowerShell. Khi ca hai san sang, launcher mo `http://127.0.0.1:5173/` bang trinh duyet mac dinh; neu trinh duyet khong mo duoc, mo URL nay thu cong. Hop thoai bao Backend/Frontend OK hoac loi kem duong dan log; bam OK de dong thong bao (dich vu van chay).
- May moi can Python >=3.11 (kem pip), Node.js + npm, va ket noi mang de cai dependency lan dau. `run.bat` hien cua so tien do tu luc kiem tra, qua cac buoc sua `.venv`/cai dependency/build FE, khoi dong BE/FE va mo game; chi dong cua so tien do sau khi hoan tat, thong bao ket qua rieng. Neu loi, xem `data/logs/setup.stderr.log` va hop thoai. Launcher tu cai package tu `requirements.txt`, `npm ci` neu thieu `node_modules`, va build FE truoc khi chay. Cac lan sau tai su dung dependency; khi frontend can cap nhat trong luc server dang chay, chay `npm run build` trong `frontend` va khoi dong lai app.
- `run.bat` va nut Mo Game 3Q deu goi backend de mo BlueStacks va game. Khi chua co thiet bi, backend doc instance co ten hien thi `3Q` va cong ADB tu `bluestacks.conf`, cho Android boot toi da 90 giay; khong hardcode serial. Bat ADB trong BlueStacks truoc.
- Tuy chon moi truong backend: `BLUESTACKS_INSTANCE`, `BLUESTACKS_PLAYER`, `BLUESTACKS_CONFIG`. Neu nhieu thiet bi dang online, chon thiet bi tren giao dien truoc khi mo game.
- API: `POST /api/devices/launch-game` tu khoi dong; `POST /api/devices/{serial}/launch-game` dung thiet bi da chon. Loi tra HTTP 503 voi code `GAME_LAUNCH_FAILED`; thanh cong tra serial va xac nhan activity game foreground, khong bao dam da dang nhap vao game.
- Chay lai `run.bat` de kiem tra dich vu va mo game. Khong tu tat tien trinh hay khoi dong trung. Dung `powershell.exe -NoProfile -File tools\launcher.ps1 -NoNotification` neu chi can ket qua trong terminal, khong hien hop thoai.
- Launcher tu build giao dien khi khoi dong moi. Khong su dung watcher/auto-reload. De kiem tra khong mo hop thoai/trinh duyet/game: `powershell.exe -NoProfile -File tools\launcher.ps1 -NoNotification -NoBrowser -SkipGameLaunch`. Co `-SkipGameLaunch` thi khong goi API launch-game; mac dinh run.bat van mo game nhu cu. Khi cap nhat app dang chay, kiem tra PID dang LISTEN cong 8000/5173 va CommandLine dung project, chi dung hai PID da xac nhan truoc khi chay launcher; launcher khong tu tat process.
- Mo `http://127.0.0.1:5173` thu cong. Log dich vu nam trong `data/logs/backend.stderr.log`, `frontend.stderr.log` va cac file stdout tuong ung.
- Neu cong 8000/5173 da ban, launcher bao loi va khong tat tien trinh khac; khong tu mo BlueStacks hay game.
- Neu `backend.stderr.log` bao `did not find executable at ...python.exe`, venv dang tro toi ban Python da bi go. Cai Python >=3.11, sau do tai thu muc goc chay `& 'C:\duong-dan-den-python\python.exe' -m venv --upgrade .venv` va `& '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt`. Neu import van loi sau khi nang cap venv, cai lai dependency bang `& '.\.venv\Scripts\python.exe' -m pip install --force-reinstall -r requirements.txt`; chay lai `run.bat`. Launcher kiem tra Python va dependencies truoc khi mo service de bao loi som.
- Khi chay kich ban, bang tien trinh doc tu hien va giu hien trong luc chay. Phan con lai cua giao dien van thao tac duoc; nut Dong luon bam duoc va chi thu nho bang (khong dung kich ban). Bam nut Tien trinh kich ban o goc duoi phai de mo lai; polling khong tu bung bang khi da thu nho.
- Kiem tra hoi quy ket thuc graph: `.venv\Scripts\python.exe -m pytest backend\tests\unit\test_scenario_completion.py -q` (khong gui lenh ADB).

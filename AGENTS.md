# PROMPT CHO IDE AI

Hãy đọc toàn bộ file `MASTER_SPEC.md` trong thư mục này.

Bạn là Senior Python Computer Vision Engineer, Senior React/TypeScript Engineer và Software Architect. Hãy triển khai dự án `isometric-auto-studio` theo toàn bộ tài liệu MASTER_SPEC.md. Đây là ứng dụng Windows-local dùng ADB để điều khiển BlueStacks; game có bản đồ isometric 45°, công trình cố định, HUD và icon nổi che nhiều vùng bản đồ. Runtime không dùng AI; chỉ dùng thuật toán CV, state machine và macro do người dùng định nghĩa.

**Quy tắc làm việc bắt buộc:**
1. Đọc toàn bộ MASTER_SPEC.md trước khi code. Kiểm tra repo hiện có, không xóa hoặc ghi đè code hoạt động nếu không cần.
2. Triển khai tuần tự Phase 0→7, nhưng trước tiên chỉ thực hiện Phase 0 và Phase 1. Mỗi phase phải có code chạy được, test, README, API mẫu và hướng dẫn test thực tế.
3. Không giả lập ADB success trong production. Nếu chưa có BlueStacks để thử, cung cấp FakeADB riêng cho unit tests và đánh dấu integration chưa xác nhận.
4. Backend quản lý single input queue, camera pose và workflow state; frontend không gọi ADB trực tiếp.
5. Camera tracking phải mask HUD, dùng Optical Flow + ORB/RANSAC, đo confidence, reject ambiguous, không cập nhật camera khi chưa xác thực.
6. Navigation dùng closed-loop: swipe→wait settle→screenshot→track→replan; dừng khi camera lost. Không cần quay về Nhà Chính giữa task.
7. Recorder phải ghi screenshot before/after và có khả năng chuyển click thành FindImage/TapDetected hoặc NavigateBuilding.
8. Workflow phải validate graph và có timeout, retry giới hạn, cancel, pause, verify; không chạy vô hạn.
9. Viết code có type hints, Pydantic schemas, error codes, logging, tests. Không hardcode serial 5555, resolution hay tọa độ.
10. Sau mỗi phase báo: file đã tạo/sửa, lệnh chạy, test pass/fail, chức năng đã kiểm thử thật, chức năng chưa hoàn thành, vấn đề còn tồn tại và đề xuất phase tiếp.

11. Mỗi action trong marco dinh nghãi thành các file riêng để dể bảo trì
12. Không dùng auto-reload / file watcher theo dõi file tự động vì gây tốn nhiều CPU. Sau khi AI edit code xong, AI bắt buộc phải tự reload app BE + FE (build FE và restart backend) để app nhận code mới ngay lập tức.

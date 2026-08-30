=== HƯỚNG DẪN CÀI ĐẶT SERVICE MANAGER CLIENT ===

1. Yêu cầu hệ thống:
   - Cài đặt sẵn Node.js (https://nodejs.org) để tải các thư viện cần thiết.
   - (Tùy chọn) Máy quay IP / Webcam.

2. Cài đặt và Chạy lần đầu:
   - Mở thư mục SM-Client-Portable.
   - Nhấp đúp vào file "Start-Client.bat".
   - Trong lần chạy đầu tiên, script sẽ tự động tải các thư viện cần thiết (npm install) và sau đó khởi chạy ứng dụng.

3. Tự động chạy cùng Windows:
   - Nhấp đúp vào file "Install-Service.bat".
   - Ứng dụng sẽ tự động chạy ngầm mỗi khi khởi động máy.

4. Gỡ bỏ tự động chạy:
   - Nhấp đúp vào file "Uninstall-Service.bat".

5. Tắt ứng dụng:
   - Nhấp đúp vào file "Stop-Client.bat" để dừng hoàn toàn các tiến trình của Client.

Lưu ý: Nếu không có file resources/go2rtc.exe, ứng dụng vẫn sẽ hoạt động với các chức năng cơ bản, nhưng sẽ không thể xử lý các luồng camera IP (RTSP). Hãy đảm bảo sao chép file này từ bản gốc vào thư mục resources nếu cần thiết.

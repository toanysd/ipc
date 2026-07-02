# Original User Request

## Initial Request — 2026-06-01T05:50:50Z

Xây dựng ứng dụng web quản lý IP camera trong mạng LAN (dùng chung WiFi). Ứng dụng có thể tự động dò tìm camera (ONVIF), xem trực tiếp (Live View) và hỗ trợ chức năng ghi hình (Record) lưu vào máy chủ.

Working directory: e:\AntiGravity\apps\ipc
Integrity mode: development

## Requirements

### R1. Tự động dò tìm Camera trong mạng nội bộ (ONVIF Discovery)
Ứng dụng có khả năng quét và nhận diện tự động các IP Camera đang kết nối cùng mạng WiFi (sử dụng giao thức WS-Discovery hoặc tương tự). Không yêu cầu người dùng phải thiết lập địa chỉ IP thủ công.

### R2. Xem trực tiếp Camera (Live View)
Có giao diện web thân thiện, responsive (tốt trên cả PC và Mobile) để hiển thị luồng video trực tiếp từ camera (RTSP stream). Người dùng có thể nhấn vào 1 camera được phát hiện để bắt đầu xem.

### R3. Ghi hình và lưu trữ
Có nút để người dùng ra lệnh ghi hình từ luồng camera trực tiếp và lưu thành file video (ví dụ: mp4) trực tiếp xuống thư mục trên máy tính chạy ứng dụng.

## Acceptance Criteria

### Dò tìm Camera
- [ ] Chạy lệnh backend quét mạng và trả về được danh sách các IP Camera (hoặc trả về mảng rỗng nếu không có thiết bị thật) mà không bị crash.

### Live View
- [ ] Có thể trích xuất luồng video hoặc mô phỏng việc xem trực tiếp trên giao diện trình duyệt mà không yêu cầu cài đặt plugin (sử dụng WebRTC, MJPEG, hoặc HLS proxy).

### Ghi hình (Record)
- [ ] Tính năng ghi hình lưu file video thành công xuống ổ cứng (có thể kiểm tra bằng lệnh kiểm tra sự tồn tại của file sau khi gọi hàm record).

## Follow-up — 2026-06-01T13:10:13Z

Avoid heavy processing that might freeze the machine (limit concurrent agents/tests).

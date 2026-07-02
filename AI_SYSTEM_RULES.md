# HƯỚNG DẪN VÀ QUY TẮC HỆ THỐNG DÀNH CHO AI (AI SYSTEM RULES)
*File này cung cấp ngữ cảnh bắt buộc cho bất kỳ AI Agent nào khi làm việc trong môi trường này.*

## KIẾN TRÚC ANTIGRAVITY PORTABLE WORKSPACE (MONOREPO V2.0)

Hệ thống này được thiết lập theo cơ chế đặc biệt: **"Portable USB to Local SSD"** nhằm tối ưu hiệu năng (tránh thắt cổ chai tốc độ I/O của USB) và tránh lỗi Symlink khi di chuyển giữa nhiều máy tính khác nhau.

### 1. Kiến trúc lưu trữ (Storage Architecture)
- **Nguồn dữ liệu gốc (Source of Truth):** Nằm trên USB (ổ G: hoặc tùy máy). Đây là nơi cất giữ code vĩnh viễn.
- **Không gian làm việc cục bộ (Local Workspace):** Được tạo tự động trên ổ cứng nội bộ của máy (VD: `C:\AntiGravity_Workspace` hoặc `D:\AntiGravity_Workspace`).
- **QUY TẮC AI:** Mọi thao tác chỉnh sửa code, viết script, cài thư viện, chạy dev server **PHẢI THỰC HIỆN TRONG LOCAL WORKSPACE (Ổ Cứng)**. AI tuyệt đối không sửa code trực tiếp trên USB để tránh crash.

### 2. Quản lý Dependencies & Cache
- **`node_modules` và `.next`:** Chỉ tồn tại trên Local Workspace. Hai thư mục siêu nặng này tuyệt đối không được copy ngược về USB.
- **Cấu hình Next.js (Dev vs Build):** BẮT BUỘC cấu hình scripts trong `package.json` theo chuẩn sau:
  - `"dev": "next dev --turbo"`: Sử dụng Turbopack khi lập trình để khởi động siêu tốc và tiết kiệm CPU/RAM (không sinh rác `node.exe`). Lỗi Symlink của Turbopack đã được khắc phục nhờ mã nguồn nằm hoàn toàn ở Local SSD.
  - `"build": "next build"`: **TUYỆT ĐỐI KHÔNG dùng `--turbo` khi build**. Turbopack build hiện tại đang bị lỗi mất phương hướng thư mục trong môi trường Monorepo. Phải để Next.js lùi về dùng Webpack ổn định khi đóng gói sản phẩm.

### 3. Quy trình làm việc hàng ngày (Boot & Save)
1. **BOOT (`USB_SYNC_BOOT.bat`):** Chạy từ USB. Tự động liên kết bộ nhớ AI (`.gemini`) và đồng bộ (copy) code của các dự án được chọn sang Local Workspace. Đồng thời, tên các dự án này được ghi dồn vào cuốn sổ tay `.synced_apps.txt`.
2. **SAVE (`USB_SYNC_SAVE.bat`):** Chạy từ USB vào cuối ca làm việc. Đọc cuốn sổ tay `.synced_apps.txt` và dùng `robocopy` để sao chép song phương cập nhật ngược code từ Local Workspace về lại USB. Nó bỏ qua `node_modules` và `.next` để tiết kiệm thời gian.
- **QUY TẮC AI:** Nếu User hỏi về luồng đồng bộ, AI cần hiểu rằng quá trình chọn nhiều app được tích lũy lại (Append Memory), chứ không ghi đè mất app cũ.

### 4. Quy định khi Coding
- **No Hardcoding Drives:** Tuyệt đối không hardcode đường dẫn ổ đĩa như `C:\` hay `G:\` trong mã nguồn. Hãy dùng đường dẫn tương đối (Relative paths) hoặc biến môi trường vì User sẽ thường xuyên di chuyển USB giữa các máy có số lượng ổ đĩa khác nhau.
- **Port Caching:** Khi phát triển, chú ý giải phóng cổng (port) như `3015` vì đôi khi Webpack bị treo do máy cấu hình thấp.
- **Nenkin & Apps:** Cấu trúc dự án theo mô hình Monorepo (tất cả các app nằm trong thư mục `apps/` và chia sẻ `packages/`). Lệnh `pnpm install` phải được chạy ở root (`AntiGravity_Workspace`), không chạy đơn lẻ trong từng folder app để tận dụng workspace.

### 5. Quản lý File Rác & Debug (Cleanup Rules)
- **THƯ MỤC CHỨA FILE TẠM:** Trong quá trình dev, nếu AI cần tạo các file script nháp để test, debug (như `test_api.js`, `check_db.py`, `.rar`, `.log`...) BẮT BUỘC phải tạo và lưu chúng vào thư mục `temp_ai/` nằm ở thư mục gốc của app đó (VD: `apps/nenkin/temp_ai/`).
- **Lý do:** Tuyệt đối không xả rác file test bừa bãi ra thư mục gốc dự án. Thư mục `temp_ai/` này đã được cấu hình trong `USB_SYNC_SAVE.bat` để chặn không cho copy về ổ USB, giúp mã nguồn gốc trên USB luôn sạch sẽ 100%.

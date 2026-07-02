# Hướng dẫn Khởi tạo & Chạy Dự án (Antigravity V2.0)

File này lưu trữ các lệnh quan trọng để làm việc với kiến trúc Monorepo trên ổ `G:\`. Bạn không cần phải nhớ code, chỉ cần mở file này ra xem hoặc copy kịch bản `.bat`.

## 1. Hệ sinh thái Node.js / JavaScript (Dùng `pnpm`)

Hệ thống dùng `pnpm workspaces` để các dự án xài chung `node_modules` (không bị nặng ổ đĩa).

**Khởi tạo lần đầu (hoặc khi thêm thư viện mới):**
1. Mở Terminal (PowerShell) tại gốc `G:\AntiGravity`
2. Gõ lệnh: `pnpm install`
*(Lệnh này sẽ quét toàn bộ các thư mục trong `apps/` và tự động liên kết các thư viện).*

**Chạy một dự án cụ thể (vd: kidgame):**
- Mở thư mục dự án `G:\AntiGravity\apps\kidgame`
- Gõ: `pnpm run dev` *(Lưu ý: Nếu cần truyền cờ cho ứng dụng con, dùng `--`, ví dụ `pnpm run dev -- --force` chứ tuyệt đối không gõ `pnpm run dev --force` vì sẽ kích hoạt chế độ ép cài lại của pnpm).*

**Xử lý lỗi pnpm (ERR_PNPM_IGNORED_BUILDS):**
- Nếu cài đặt thư viện bị lỗi do pnpm v9+ chặn các build script (như `sqlite3`, `prisma`), hãy mở file `G:\AntiGravity\pnpm-workspace.yaml` và cấp quyền cho thư viện đó trong mục `allowBuilds:`.

---

## 2. Hệ sinh thái Python (Dùng `uv`)

**Khởi tạo dự án Python mới / Chạy app hiện có:**
Thay vì dùng `python -m venv .venv` rất chậm, hệ thống dùng `uv`.
- Tạo môi trường: `uv venv`
- Cài thư viện: `uv pip install -r requirements.txt` (hoặc `uv add fastapi`)
- Chạy code: `uv run main.py` 
*(Lệnh `uv run` cực kỳ thông minh, nó sẽ tự động kích hoạt môi trường ảo ảo để chạy mã mà bạn không cần gõ `activate`)*.

---

## 3. Template File `.bat` Tự Động Hóa "Click-and-Run"

Để không phải gõ lệnh bằng tay, bạn hãy copy nội dung file mẫu `G:\AntiGravity\apps\_template_run.bat` vào thư mục dự án của bạn (ví dụ đổi tên thành `start_app.bat`), sau đó click đúp để chạy. Kịch bản này tự động kiểm tra xem máy đã cài thư viện chưa, nếu chưa nó tự cài, rồi bật server và mở web cho bạn.

---

## 4. Kiến trúc Portable USB (Đồng bộ USB sang Ổ cứng)
Hệ thống được trang bị cơ chế tự động hoá siêu việt giúp bạn code trên bất kỳ máy tính nào mà không lo nặng USB hay lỗi môi trường:

1. **Khi bắt đầu làm việc (BOOT):** Cắm USB vào máy, chạy `USB_SYNC_BOOT.bat` trên USB. Chọn 1 hoặc nhiều dự án (nhập cách nhau bằng dấu cách, vd: `1 5 15`). Kịch bản sẽ tự động chép mã nguồn sang một không gian làm việc siêu tốc trên ổ cứng (VD: `D:\AntiGravity_Workspace`).
2. **Làm việc (CODE):** Mở IDE tại ổ cứng và thao tác bình thường. Thư mục `.gemini` (bộ não AI) được ánh xạ động về USB để AI luôn có trí nhớ dù sang máy khác.
3. **Khi kết thúc làm việc (SAVE):** Chạy `USB_SYNC_SAVE.bat` trên USB. Hệ thống sẽ tự tìm những dự án bạn vừa làm và chép các đoạn code mới từ ổ cứng dội ngược về USB, đồng thời tự động chối bỏ những thư mục nặng như `node_modules` và `.next` để USB không bị phình to.

*Lưu ý: Mọi dự án Next.js trong hệ thống bắt buộc chạy với cờ `--webpack` thay vì Turbopack để tương thích hoàn toàn với kiến trúc Portable này.*

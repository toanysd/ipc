-- Chạy 1 lần trong Supabase SQL Editor
-- Thêm các cột cần thiết cho Tunnel Manager

ALTER TABLE sm_devices
  ADD COLUMN IF NOT EXISTS tunnel_url    text,
  ADD COLUMN IF NOT EXISTS tailscale_ip  text;

-- (Tùy chọn) Index nếu cần query nhanh theo device_id
CREATE INDEX IF NOT EXISTS idx_sm_devices_device_id ON sm_devices(device_id);

-- Xác nhận
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sm_devices'
  AND column_name IN ('tunnel_url', 'tailscale_ip');

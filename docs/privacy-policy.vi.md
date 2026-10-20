# Chính sách quyền riêng tư

Cập nhật: 20 tháng 10 năm 2026.

3fingers mở các website mạng xã hội cạnh nhau trong Chrome. Sản phẩm không có tài khoản riêng, analytics hoặc máy chủ do nhà phát triển vận hành. Code xử lý các dữ liệu sau trên thiết bị để cung cấp workspace.

| Dữ liệu | Mục đích và thời gian lưu |
| --- | --- |
| URL panel, thứ tự, ghim, độ rộng, các panel dư đã lưu, giao diện và ngôn ngữ extension | Lưu trong Chrome local storage của extension cho đến khi được thay đổi hoặc dữ liệu extension bị xóa. URL có thể chứa query string. Đây không phải Chrome Sync storage. |
| URL điều hướng của panel | Back giữ tối đa 50 URL cùng origin mỗi panel, gồm query string, trong Chrome session storage. Đóng workspace hoặc bỏ/thay panel sẽ xóa lịch sử runtime tương ứng. Session storage cũng bị xóa khi Chrome khởi động lại hoặc extension được reload, cập nhật hay vô hiệu hóa. Chỉ khởi động lại service worker không xóa dữ liệu này. |
| Vị trí cuộn, thao tác nhập, cấu trúc trang và trạng thái giao diện | Xử lý để tìm vùng cuộn, đồng bộ các feed phù hợp, kéo cuộn riêng và kích hoạt theme gốc. Extension không trích xuất nội dung bài đăng/tin nhắn để tạo cơ sở dữ liệu, telemetry hoặc cho nhà phát triển xem. |
| Reddit `csrf_token` và X `ct0` | Khi được cấp quyền cookies/site tùy chọn, extension chỉ lấy đúng các tên cookie CSRF này để khôi phục request gốc trong trang nhúng. Giá trị HttpOnly bị loại và không được cung cấp cho trang. Với giá trị còn lại, nếu document panel đã đăng ký của chính site thiếu token thì được bổ sung. Giá trị chỉ ở bộ nhớ, được cập nhật/xóa theo cookie và không ghi log hoặc lưu trong extension storage. Bridge không đọc cookie đăng nhập/phiên. |

Script của site trong panel vẫn có quyền riêng của website đối với dữ liệu của nó. Helper theme gọi điều khiển gốc của site; một số lần ghi tùy chọn theme cần tương thích với ngữ cảnh nhúng và có thể tải lại panel. Tùy chọn gốc này cũng có thể ảnh hưởng tab khác hoặc cài đặt tài khoản của site.

## Kết nối và quyền truy cập

Trang social kết nối trực tiếp tới dịch vụ của nó và các bên thứ ba theo chính sách riêng của họ. Họ nhận request trang, cookies, playback và tương tác thông thường. 3fingers không gửi dữ liệu feed/token CSRF tới dịch vụ của nhà phát triển, bán dữ liệu, dùng cho quảng cáo hoặc mục đích không liên quan. Không có telemetry gửi về nhà phát triển. Bấm GitHub sẽ mở GitHub; lượt truy cập đó do chính sách GitHub điều chỉnh. Font Ubuntu được đóng gói sẵn, không gửi request tới Google Fonts.

Quyền site được xin khi bạn mở site. Reddit và X xin thêm quyền cookies tùy chọn của Chrome. Quyền này về kỹ thuật rộng hơn hai tên cookie code đọc; code giới hạn việc đọc theo tên và origin cố định. Từ chối quyền giữ nguyên layout đã lưu. Thu hồi quyền cần thiết sẽ vô hiệu hóa các panel liên quan.

Để cho phép nhúng, 3fingers xóa X-Frame-Options và toàn bộ header Content-Security-Policy khỏi tài liệu iframe qua mạng khớp origin panel đang bật trong tab workspace. Bao gồm cả iframe lồng khớp rule. Điều này giảm bảo vệ của website trong các tài liệu đó. Tab bình thường nằm ngoài rule. Xem [ghi chú kỹ thuật](README.md#privacy).

## Quyền kiểm soát của bạn

Đổi hoặc đóng panel để cập nhật layout. Đóng workspace xóa phiên runtime, không xóa layout hoặc kho panel dư đã lưu. Bạn có thể thu hồi quyền site/cookies hoặc gỡ extension tại `chrome://extensions`. Gỡ extension sẽ xóa Chrome extension storage của nó; không xóa tài khoản social, cookie của site hoặc tùy chọn theme gốc. Hãy quản lý các dữ liệu đó riêng trong site hoặc cài đặt Chrome.

3fingers chỉ dùng dữ liệu cho các chức năng workspace đã nêu và tuân theo yêu cầu Limited Use của Chrome Web Store User Data Policy. Nhà phát triển không thể xem feed của bạn thông qua extension. Nếu bạn tự gửi báo lỗi công khai, GitHub lưu nội dung bạn gửi; hãy xóa dữ liệu tài khoản, cookies và token trước.

Liên hệ: [project issues](https://github.com/tqdat410/3fingers/issues). Đừng đăng dữ liệu tài khoản riêng tư tại đó. Các thay đổi tương lai về xử lý dữ liệu sẽ được cập nhật trong chính sách này.

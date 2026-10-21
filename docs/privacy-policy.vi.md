# Chính sách quyền riêng tư

Cập nhật: 21 tháng 10 năm 2026.

3fingers không có hệ thống tài khoản riêng, công cụ phân tích hành vi hay máy chủ của nhà phát triển. Tiện ích xử lý dữ liệu trên thiết bị của bạn để hiển thị các mạng xã hội và đồng bộ thao tác cuộn.

- **Bố cục đã lưu:** địa chỉ trang, thứ tự, ghim, độ rộng, các khung đã lưu nhưng chưa mở, giao diện và ngôn ngữ được lưu trong bộ nhớ cục bộ của tiện ích cho đến khi bạn thay đổi hoặc xóa. Địa chỉ có thể chứa tham số truy vấn. Dữ liệu này không dùng Chrome Sync.
- **Lịch sử quay lại:** mỗi khung giữ tối đa 50 địa chỉ cùng nguồn (origin), gồm cả tham số truy vấn, trong bộ nhớ phiên của Chrome. Đóng 3fingers hoặc xóa/thay một khung sẽ xóa lịch sử tương ứng. Khởi động lại Chrome, tải lại, cập nhật hoặc tắt tiện ích cũng xóa lịch sử này; chỉ khởi động lại tiến trình nền (service worker) thì không.
- **Cuộn và giao diện:** tiện ích đọc vị trí cuộn, thao tác, cấu trúc trang và trạng thái sáng/tối để thực hiện các chức năng điều khiển. Nội dung bài đăng và tin nhắn không được thu thập để lập cơ sở dữ liệu, phân tích hay gửi cho nhà phát triển.
- **Cookie của Reddit và X:** khi được cấp quyền, tiện ích chỉ đọc `csrf_token` của Reddit và `ct0` của X để hỗ trợ yêu cầu từ trang đang nhúng. Giá trị HttpOnly bị loại bỏ. Token chỉ được bổ sung khi còn thiếu, vào đúng khung của trang đó. Token chỉ ở trong bộ nhớ, thay đổi theo cookie và không được ghi nhật ký hay lưu vào bộ nhớ tiện ích. Chức năng này không đọc cookie đăng nhập hoặc cookie phiên.

Đổi giao diện sáng/tối có thể tải lại khung và ảnh hưởng cả tab khác hoặc cài đặt tài khoản của mạng xã hội.

## Kết nối và quyền truy cập

Các mạng xã hội kết nối trực tiếp với dịch vụ và bên thứ ba của họ, theo cookie và chính sách quyền riêng tư của từng trang. 3fingers không gửi bảng tin hoặc token cho nhà phát triển, bán dữ liệu, dùng cho quảng cáo hay mục đích khác. Khi bạn mở GitHub, lượt truy cập đó tuân theo chính sách của GitHub. Phông chữ được đóng gói sẵn, không tải từ Google Fonts.

Chrome hỏi quyền truy cập khi bạn mở một mạng xã hội. Reddit và X cần thêm quyền truy cập cookie. Quyền Chrome cấp rộng hơn hai tên cookie mà tiện ích sử dụng; mã nguồn giới hạn việc đọc vào đúng tên và trang đã định. Từ chối quyền vẫn giữ bố cục đã lưu; thu hồi quyền cần thiết sẽ tắt các khung liên quan.

Để nhúng trang, 3fingers xóa `X-Frame-Options` và **toàn bộ header `Content-Security-Policy`** khỏi các tài liệu iframe tải qua mạng, khớp nguồn của các trang đang bật trong tab 3fingers. Iframe lồng nhau cũng chịu tác động nếu khớp điều kiện này. Việc này làm giảm các lớp bảo vệ của những trang đó. Tab thông thường không bị tác động. Xem [chi tiết kỹ thuật](README.md#privacy).

## Tùy chọn website

Website lưu riêng ngôn ngữ và giao diện bạn chọn trong bộ nhớ cục bộ của trình duyệt, không gửi các tùy chọn này đến API sản phẩm. Bạn có thể xóa dữ liệu trang web để đặt lại.

## Quyền kiểm soát của bạn

Bạn có thể quản lý quyền hoặc gỡ 3fingers tại `chrome://extensions`. Đóng tab 3fingers sẽ kết thúc phiên đang chạy nhưng giữ bố cục và các khung đã lưu nhưng chưa mở. Gỡ tiện ích sẽ xóa dữ liệu của tiện ích, không xóa tài khoản mạng xã hội, cookie hay tùy chọn giao diện của các trang. Hãy quản lý những dữ liệu đó trong từng trang hoặc cài đặt Chrome.

3fingers chỉ dùng dữ liệu cho các chức năng đã nêu và tuân theo yêu cầu Limited Use của Chrome Web Store User Data Policy. Nhà phát triển không thể xem bảng tin của bạn thông qua tiện ích.

Nếu có câu hỏi, hãy gửi qua [GitHub Issues](https://github.com/tqdat410/3fingers/issues). Nội dung báo lỗi là công khai: xóa thông tin riêng tư, cookie và token trước khi gửi. Chính sách này sẽ được cập nhật nếu cách xử lý dữ liệu thay đổi.

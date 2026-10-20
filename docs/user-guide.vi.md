# Hướng dẫn sử dụng

Đọc các bảng tin mạng xã hội cạnh nhau trong một tab Chrome trên máy tính. Workspace có thể chứa một, hai hoặc ba panel.

## Cài đặt

Tải ZIP ứng dụng đính kèm trong [bản GitHub mới nhất](https://github.com/tqdat410/3fingers/releases/latest). ZIP mã nguồn GitHub tự tạo dùng cho phát triển.

Giải nén vào thư mục bạn sẽ giữ lại. Mở `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked** và chọn thư mục đó. Không cần build hoặc máy chủ.

Bấm biểu tượng extension để mở 3fingers. Nếu social yêu cầu đăng nhập, đăng nhập trên tab website bình thường trước rồi quay lại 3fingers.

## Kết nối social

Mở panel hoặc chọn social bằng nút đổi trang. Chrome có thể hỏi quyền truy cập site. Extension dùng quyền này để hiển thị trang, điều khiển cuộn và kích hoạt giao diện gốc. Dòng “Read and change your data” mô tả khả năng của quyền Chrome cấp, không phải một tính năng đăng bài riêng.

Reddit và X xin thêm quyền cookies tùy chọn để lấy đúng tên cookie CSRF cần cho request gốc trong trang nhúng. Giá trị HttpOnly bị loại. Quyền Chrome cấp rộng hơn hai tên cookie mà code sử dụng. Các social khác không xin quyền đọc cookies qua API.

TikTok cần truy cập các subdomain của nó để phát video. Quyền được xin theo social bạn chọn. Bạn có thể từ chối mà vẫn giữ layout; bấm Mở (Open) để thử lại sau. Chrome thường ghi nhớ quyền đã cấp, không cần hỏi lại cùng quyền sau mỗi lần tải lại.

## Đọc đồng bộ hoặc riêng từng trang

Lăn chuột để cuộn đồng bộ các panel có ghim rỗng. Mỗi feed giữ vị trí đọc riêng.

Bấm ghim để loại panel đó khỏi đồng bộ. Ghim đặc là độc lập; ghim rỗng là đồng bộ. Ghim một panel không ngăn hai panel còn lại cuộn cùng nhau. Kéo nội dung feed lên/xuống để chỉ cuộn feed đó, kể cả khi ghim đang rỗng.

Bình luận, chat và hộp thoại giữ cách cuộn riêng. Đóng chúng để quay lại feed. TikTok và YouTube Shorts luôn chuyển video độc lập. Facebook và Instagram Reels cũng độc lập khi đang mở; rời trình xem sẽ khôi phục lựa chọn ghim. Video nằm trong bài đăng thông thường không thay đổi chính sách cuộn của feed.

## Sắp xếp panel

Kéo vùng trống trên thanh nhỏ của panel để đổi vị trí. Thả để lưu hoặc bấm Escape để hủy. Bạn cũng có thể dùng phím mũi tên khi focus nút ghim để đổi thứ tự. Các nút biểu tượng giữ chức năng bấm riêng.

Bấm **+** trong menu extension để thêm social. Tối đa ba panel, có thể mở trùng social. Dùng nút đổi trang của panel để thay social, hoặc nút đóng để bỏ panel.

Một panel chiếm toàn bộ trang. Ba panel có độ rộng bằng nhau. Khi có hai panel, nút độ rộng cho chọn 33%, 50% hoặc 66%; panel còn lại tự lấp phần còn lại.

## Điều hướng và giao diện

Back chỉ quay lại trong panel được chọn theo lịch sử URL cùng origin. Trang có thể tải lại; chức năng này không khôi phục bản nháp chưa gửi hoặc mọi trạng thái tạm của social. Reload tải lại một panel; **Reload all** trong menu bắt đầu tải lại đồng thời các panel được cấp quyền.

Nút mặt trời/mặt trăng trên panel kích hoạt theme gốc của social. Một số site sẽ tải lại panel để áp dụng. Tùy chọn này cũng có thể ảnh hưởng tab khác hoặc cài đặt tài khoản của site. Nếu không tìm thấy điều khiển gốc phù hợp, nút bị vô hiệu hóa thay vì áp bảng màu tự tạo. Nút sáng/tối trong menu extension chỉ đổi giao diện 3fingers.

## Ngôn ngữ

Bản mã nguồn tiếp theo sau v1.0.0 thêm **Auto (Tự động) / English / Tiếng Việt** trong menu extension. Auto theo ngôn ngữ giao diện Chrome: tiếng Việt chọn VI, các ngôn ngữ khác dùng EN. Lựa chọn thủ công được lưu cục bộ. Đổi ngôn ngữ cập nhật chữ và tooltip của extension mà không tải lại feed.

Tùy chọn này không đổi ngôn ngữ social. Hộp thoại xin quyền của Chrome và thông tin extension do Chrome hiển thị vẫn theo locale Chrome riêng.

## Cập nhật

Tải ZIP ứng dụng mới, thay file **bên trong cùng thư mục cài đặt cũ**. Giữ nguyên Chrome profile và bấm **Reload** trên thẻ extension. Đừng gỡ extension hoặc nạp một thư mục mới nếu muốn giữ layout. Cách này cũng dùng khi nâng Beta lên Stable. Bản cài qua GitHub cần cập nhật thủ công.

## Tương thích và hỗ trợ

YouTube chỉ hỗ trợ Shorts. X hỗ trợ đọc Home và trả lời bài đăng; cài đặt hoặc dịch vụ phụ có thể lỗi. Social có thể thay đổi cách nhúng, theme gốc hoặc cấu trúc feed. Trạng thái Connected xác nhận extension giao tiếp được với panel, không đảm bảo mọi bài đăng/video đã tải xong.

Thử website trong tab bình thường để phân biệt lỗi site/mạng với lỗi panel. Dùng cùng Chrome profile. Nếu quyền bị thu hồi, mở lại panel và cấp lại quyền nếu bạn muốn.

3fingers nới bảo vệ nhúng trong workspace, gồm toàn bộ header CSP của tài liệu iframe qua mạng khớp rule. Điều này giảm bảo vệ trong các tài liệu đó. Xem [chính sách quyền riêng tư](privacy-policy.vi.md) và [ghi chú kỹ thuật](README.md#privacy).

[Báo lỗi](https://github.com/tqdat410/3fingers/issues/new/choose) kèm phiên bản Chrome và các bước tái hiện. Xóa nội dung feed riêng tư, cookies và token khỏi ảnh hoặc log.

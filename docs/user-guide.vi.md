# Tài liệu 3fingers

Lướt đồng thời nhiều trang mạng xã hội trong cùng một tab Chrome trên máy tính. Bạn có thể mở một, hai hoặc ba khung.

## Các mạng xã hội được hỗ trợ

| Mạng xã hội | Cuộn | Ghi chú |
| --- | --- | --- |
| Facebook | Bảng tin đồng bộ | Reels cuộn riêng khi đang mở. |
| Instagram | Bảng tin đồng bộ | Reels cuộn riêng khi đang mở. |
| Threads | Bảng tin đồng bộ | Tốc độ tải thêm bảng tin có thể khác nhau. |
| TikTok | Độc lập | Giữ điều hướng video ngắn gốc. |
| X | Bảng tin đồng bộ | Trang chủ (Home) và trả lời bài đăng; dịch vụ phụ có thể lỗi. |
| Reddit | Bảng tin đồng bộ | Xin thêm quyền cookies tùy chọn. |
| YouTube Shorts | Độc lập | Video YouTube thông thường nằm ngoài phạm vi hỗ trợ. |

## Cài đặt

Tải ZIP ứng dụng đính kèm trong [bản GitHub mới nhất](https://github.com/tqdat410/3fingers/releases/latest). ZIP mã nguồn GitHub tự tạo dùng cho phát triển.

Giải nén vào thư mục bạn sẽ giữ lại. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển (Developer mode)**, bấm **Tải tiện ích đã giải nén (Load unpacked)** và chọn thư mục đó. Không cần build hoặc máy chủ.

Bấm biểu tượng tiện ích để mở 3fingers. Nếu mạng xã hội yêu cầu đăng nhập, đăng nhập trên tab trang web bình thường trước rồi quay lại 3fingers.

## Kết nối mạng xã hội

Mở khung hoặc chọn mạng xã hội bằng nút đổi trang. Chrome có thể hỏi quyền truy cập trang. Extension dùng quyền này để hiển thị trang, điều khiển cuộn và kích hoạt giao diện gốc. Dòng “Read and change your data” mô tả khả năng của quyền Chrome cấp, không phải một tính năng đăng bài riêng.

Reddit và X xin thêm quyền cookies tùy chọn để lấy đúng tên cookie CSRF cần cho request gốc trong trang nhúng. Giá trị HttpOnly bị loại. Quyền Chrome cấp rộng hơn hai tên cookie mà code sử dụng. Các mạng xã hội khác không xin quyền đọc cookies qua API.

TikTok cần truy cập các tên miền phụ của nó để phát video. Quyền được xin theo mạng xã hội bạn chọn. Bạn có thể từ chối mà vẫn giữ bố cục; bấm Mở (Open) để thử lại sau. Chrome thường ghi nhớ quyền đã cấp, không cần hỏi lại cùng quyền sau mỗi lần tải lại.

## Đọc đồng bộ hoặc riêng từng trang

Lăn chuột để cuộn đồng bộ các khung có ghim rỗng. Mỗi bảng tin giữ vị trí đọc riêng.

Bấm ghim để loại khung đó khỏi đồng bộ. Ghim đặc là độc lập; ghim rỗng là đồng bộ. Ghim một khung không ngăn hai khung còn lại cuộn cùng nhau. Kéo nội dung bảng tin lên/xuống để chỉ cuộn bảng tin đó, kể cả khi ghim đang rỗng.

Bình luận, chat và hộp thoại giữ cách cuộn riêng. Đóng chúng để quay lại bảng tin. TikTok và YouTube Shorts luôn chuyển video độc lập. Facebook và Instagram Reels cũng độc lập khi đang mở; rời trình xem sẽ khôi phục lựa chọn ghim. Video nằm trong bài đăng thông thường không thay đổi chính sách cuộn của bảng tin.

## Sắp xếp khung

Kéo vùng trống trên thanh nhỏ của khung để đổi vị trí. Thả để lưu hoặc bấm Escape để hủy. Bạn cũng có thể dùng phím mũi tên khi đang chọn nút ghim bằng bàn phím để đổi thứ tự. Các nút biểu tượng giữ chức năng bấm riêng.

Bấm **+** trong menu tiện ích để thêm mạng xã hội. Tối đa ba khung, có thể mở trùng mạng xã hội. Dùng nút đổi trang của khung để thay mạng xã hội, hoặc nút đóng để bỏ khung.

Một khung chiếm toàn bộ trang. Ba khung có độ rộng bằng nhau. Khi có hai khung, nút độ rộng cho chọn 33%, 50% hoặc 66%; khung còn lại tự lấp phần còn lại.

## Điều hướng và giao diện

Nút Quay lại (Back) chỉ quay lại trong khung được chọn theo lịch sử URL cùng origin. Trang có thể tải lại; chức năng này không khôi phục bản nháp chưa gửi hoặc mọi trạng thái tạm của mạng xã hội. Nút Tải lại (Reload) tải lại một khung; **Tải lại tất cả (Reload all)** trong menu bắt đầu tải lại đồng thời các khung được cấp quyền.

Nút mặt trời/mặt trăng trên khung kích hoạt giao diện gốc của mạng xã hội. Một số trang sẽ tải lại khung để áp dụng. Tùy chọn này cũng có thể ảnh hưởng tab khác hoặc cài đặt tài khoản của trang. Nếu không tìm thấy điều khiển gốc phù hợp, nút bị vô hiệu hóa thay vì áp bảng màu tự tạo. Nút sáng/tối trong menu tiện ích chỉ đổi giao diện 3fingers.

## Ngôn ngữ

Bản mã nguồn tiếp theo sau v1.0.0 thêm một nút **EN / VI** cạnh nút sáng/tối trong menu tiện ích. Nút hiện ngôn ngữ đang dùng; bấm để chuyển sang ngôn ngữ còn lại. Lần đầu, tiện ích tự chọn theo ngôn ngữ giao diện Chrome: tiếng Việt chọn VI, các ngôn ngữ khác dùng EN. Lựa chọn thủ công được lưu cục bộ. Đổi ngôn ngữ cập nhật chữ và chú thích của tiện ích mà không tải lại bảng tin.

Nút **?** bên phải GitHub mở hướng dẫn trên trang web theo ngôn ngữ hiện tại của tiện ích.

Tùy chọn này không đổi ngôn ngữ mạng xã hội. Hộp thoại xin quyền của Chrome và thông tin tiện ích do Chrome hiển thị vẫn theo locale Chrome riêng.

## Cập nhật

Tải ZIP ứng dụng mới, thay file **bên trong cùng thư mục cài đặt cũ**. Giữ nguyên Chrome hồ sơ và bấm **Tải lại (Reload)** trên thẻ tiện ích. Đừng gỡ tiện ích hoặc nạp một thư mục mới nếu muốn giữ bố cục. Cách này cũng dùng khi nâng Beta lên Stable. Bản cài qua GitHub cần cập nhật thủ công.

## Tương thích và hỗ trợ

YouTube chỉ hỗ trợ Shorts. X hỗ trợ đọc Trang chủ (Home) và trả lời bài đăng; cài đặt hoặc dịch vụ phụ có thể lỗi. Mạng xã hội có thể thay đổi cách nhúng, giao diện gốc hoặc cấu trúc bảng tin. Trạng thái Đã kết nối (Connected) xác nhận tiện ích giao tiếp được với khung, không đảm bảo mọi bài đăng/video đã tải xong.

Thử trang web trong tab bình thường để phân biệt lỗi trang/mạng với lỗi khung. Dùng cùng Chrome hồ sơ. Nếu quyền bị thu hồi, mở lại khung và cấp lại quyền nếu bạn muốn.

3fingers nới bảo vệ nhúng trong không gian đọc, gồm toàn bộ header CSP của tài liệu iframe qua mạng khớp rule. Điều này giảm bảo vệ trong các tài liệu đó. Xem [chính sách quyền riêng tư](privacy-policy.vi.md) và [ghi chú kỹ thuật](README.md#privacy).

[Báo lỗi](https://github.com/tqdat410/3fingers/issues/new/choose) kèm phiên bản Chrome và các bước tái hiện. Xóa nội dung bảng tin riêng tư, cookies và token khỏi ảnh hoặc log.

## Mã nguồn và giấy phép

3fingers là dự án độc lập, dùng giấy phép [GPL-3.0-only](https://github.com/tqdat410/3fingers/blob/main/LICENSE). GPLv3 cho phép sử dụng thương mại theo điều khoản của giấy phép. Mã nguồn, các bản phát hành và báo lỗi nằm trên [GitHub](https://github.com/tqdat410/3fingers). Dự án không liên kết với các nền tảng mạng xã hội được hỗ trợ.
